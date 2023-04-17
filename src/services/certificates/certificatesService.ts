import { CertificateDto } from '../../dto/certificateDto';
import { TransactionDto } from '../../dto/transactionDto';
import { web3Service } from '../../services/web3/web3Service';
import {
  CertificateEth,
  fromDto,
  toBlockchainTransactionDto
} from '../../models/blockchain/certificateEth';
import { Certificate } from '../../models/certificate';
import { BlockchainTransaction } from '../../models/blockchainTransaction';
import { TransactionReceipt, SignedTransaction } from 'web3-core';
import { StudentService } from '../student/studentService';
import { Student } from '../../models/student';
import { Person } from '../../models/person';
import dayjs from 'dayjs';
import 'dayjs/locale/es'; // import locale
import { BlockchainTransactionDto } from '../../dto/blockchainTransactionDto';
import { notificationService } from '../../services/notifications/notificationService';
import { NotificationDto } from '../../dto/notificationDto';
import { pdfService } from '../../services/pdf/pdfService';
import { TDocumentDefinitions } from 'pdfmake/interfaces';
import { PdfDto } from 'dto/pdfDto';
import * as CryptoJS from 'crypto-js';

dayjs.locale('es');

export const CertificateService = {
  /**
   * Obtiene los certificados en blockchain y las transacciones.
   * @param id - blochainId del estudiante.
   * @returns Listado de transacciones.
   */
  async getCertificatesByStudentId(id: number) {
    // Obtengo los certificados de la blockchain.
    const certificates = await web3Service.getCertificatesByStudentId(id);

    // Obtengo los ids.
    const ids = certificates.map((c) => Number(c.id));

    // Obtengo las datos de las transacciones de cada certificado (a traves del id). Se conecta a DB local.
    const transactions = await BlockchainTransaction.findAll({
      where: {
        ceritificateBlockchainId: ids
      },
      include: [
        {
          model: Certificate,
          as: 'certificate',
          required: true,
          include: [
            {
              model: Student,
              required: true,
              include: [
                {
                  model: Person,
                  required: true
                }
              ]
            }
          ]
        }
      ]
    });

    /* Cuando no hay transacciones pero si hay certificados, 
      recuperar la info y devolverla pero sin informacion en el sistema. 
    */
    if (transactions && transactions.length > 0) {
      return BlockchainTransaction.toDtoList(transactions);
    } else {
      return certificates.map((c) => toBlockchainTransactionDto(c));
    }
  },
  async getCertificatesById(id: number) {
    const certificate = await web3Service.getCertificatesById(id);
    // validar que el dato sea nulo.
    return !isNullCertificate(certificate)
      ? toBlockchainTransactionDto(certificate)
      : null;
  },
  async createCertificate(
    certificateData: CertificateDto
  ): Promise<TransactionDto> {
    // VALIDACIONES: IDEMPOTENCIA: 2 Certificados iguales al mismo estudiante. -> Obtener los certificados por estudiante (primero local y luego en blockchain)
    // const student = await StudentService.getStudentById(certificateData.student.id);
    const student = await StudentService.getStudentById(
      certificateData.student.id
    );
    if (!student) throw new Error('No existe el estudiante');

    let signed: SignedTransaction;
    let ethCertificate: CertificateEth;
    if (this.validateCertificates(student.certificates, certificateData)) {
      // Creamos la transaccion
      try {
        ethCertificate = fromDto(certificateData);
        signed = await web3Service.createSignTransaction(ethCertificate);
      } catch (ex) {
        console.error(ex);
        throw new Error('Ha ocurrido un error al conectarse con la red');
      }

      const currentDateStr = dayjs(new Date()).toString();
      // Una vez validada la firma. Creo el certificado en la base.
      const newCertificate = new Certificate({
        degreeType: certificateData.degreeType,
        degreeName: certificateData.degreeName,
        ministerialOrdinance: certificateData.student.ministerialOrdinance,
        dateCreated: currentDateStr,
        dateModified: currentDateStr,
        waferNumber: certificateData.waferNumber,
        studentId: student.id,
        student,
        status: 'ACT'
      });
      await newCertificate.save();

      // Creo la transaccion en la base.
      if (signed) {
        const transaction = new BlockchainTransaction({
          transactionHash: signed.transactionHash,
          ceritificateId: newCertificate.id,
          status: 'PENDING',
          dateCreated: new Date(),
          dateModified: new Date()
        } as BlockchainTransaction);
        const transactionResponse = await transaction.save();
        // Envio a publicar la transaccion.
        // Mandar a publicar la trnasaccion de manera asincrona.
        web3Service
          .sendTransaction(signed)
          .then(
            async ([resultCertificate, receipt]) =>
              await this.updateStateTransaction(
                transactionResponse,
                resultCertificate,
                receipt
              )
          );
      } else {
        throw new Error('Ha ocurrido un error al crear la firma');
      }
      // Todo: Mientras tranto, se informa al usuario la publicacion de la transaccion y el estado (Pendiente).
      return {
        receipt: {},
        certificate: certificateData,
        status: 'pending'
      } as TransactionDto;
    } else {
      throw new Error(' Ya existe un certificado con el mismo nombre.');
    }
  },

  async updateStateTransaction(
    transactionResponse: BlockchainTransaction,
    resultCertificate: Partial<CertificateEth> | null,
    receipt: TransactionReceipt
  ) {
    // Con el resultado de la transaccion, actualizamos la transaccion y el certificado.
    const ret = await transactionResponse.update({
      status: 'COMPLETED',
      ceritificateBlockchainId: resultCertificate?.id || 0,
      blockNumber: receipt.blockNumber,
      blockHash: receipt.blockHash,
      from: receipt.from,
      gasUsed: receipt.gasUsed,
      dateModified: dayjs(new Date()).toString()
    });
    const notification: NotificationDto = {
      type: 'TRANSACTION',
      transactionHash: ret.transactionHash,
      status: ret.status
    };
    notificationService.sendNotification(1, notification);
  },

  async deleteCertificate(id: number) {
    try {
    } catch (error) {
      throw error;
    }
  },

  createUpdateStudent(studentId: number) {
    // Obtener el estudiante por id.
    // Si existe, verifico que el la idempotencia del titulo.
  },

  async getAllTransaction(): Promise<BlockchainTransactionDto[]> {
    const transactions = await BlockchainTransaction.findAll();
    return BlockchainTransaction.toDtoList(transactions);
  },

  /**
   * Verifica la idempotencia de los certificados.
   * Filtra aquellos que posean valores que no puedan ser repetidos.
   * No pueden existir dos certificados iguales.
   * @param certfificates Lista de certificados del estudiante
   * @param newCertificate Nuevo certificado a crear.
   */
  validateCertificates(
    certfificates: Certificate[] | undefined,
    newCertificate: CertificateDto
  ): boolean {
    let ret = false;
    if (certfificates && certfificates.length > 0) {
      // Mismo numero de oblea o mismo estudiante y misma carrera.
      const results = certfificates.filter(
        (c) =>
          c.waferNumber === newCertificate.waferNumber ||
          (c.student.id === newCertificate.student.id &&
            c.degreeName === newCertificate.degreeName)
      );
      ret = results.length < 1;
    } else {
      ret = true;
    }
    return ret;
  },

  async createCertificatePdf(
    transaction: BlockchainTransactionDto
  ): Promise<PdfDto> {
    let documentEncoded: string = CryptoJS.AES.encrypt(
      JSON.stringify(transaction),
      '1234'
    ).toString();

    const encodedWord = CryptoJS.enc.Utf8.parse(JSON.stringify(transaction)); // encodedWord Array object
    const encoded = CryptoJS.enc.Base64.stringify(encodedWord); // string: 'NzUzMjI1NDE='

    const docDefinition: TDocumentDefinitions = {
      // ownerPassword: '1234',
      permissions: {
        printing: 'highResolution', //'lowResolution'
        modifying: false,
        copying: false,
        contentAccessibility: true,
        documentAssembly: true
      },
      content: [
        { text: 'Titulo universitario', style: ['title'] },
        {
          text: [
            'El estudiante ',
            {
              text: `${transaction.certificate?.student?.person?.fullname}`,
              bold: true
            },
            'ha aprobado todas las materias corresponiendtes al plan ',
            {
              text: `${transaction.certificate?.student?.degreeProgramCurriculum}`,
              bold: true
            },
            'de la carrera ',
            {
              text: `${transaction.certificate?.student?.degreeProgramName}`,
              bold: true
            },
            'de la institución ',
            {
              text: `${transaction.certificate?.student?.universityName}`,
              bold: true
            }
          ],
          style: ['textMuted']
        },
        {
          text: 'Por lo tanto, de acuerdo con las normas vigentes en ésta Universidad, le confieren el presente diploma de '
        },
        {
          text: `${transaction.certificate?.degreeName}`,
          bold: true
        },
        {
          qr: `http://192.168.0.10:4200/validate/${encoded}`,
          version: 25,
          fit: 250,
          margin: [0, 30]
        }
      ],
      defaultStyle: {
        font: 'MyFont',
        alignment: 'center',
        fontSize: 18
      },
      styles: {
        normalText: {
          fontSize: 18
        },
        textMuted: {
          color: '#8e8c8c'
        },
        textBold: {
          bold: true
        },
        h4: {
          fontSize: 20
        },
        title: {
          fontSize: 32
        }
      }
    };
    return {
      name: `${transaction.certificate?.student.person.fullname}_Certificado${transaction.certificateBlockchainId}.pdf`,
      document: await pdfService.createPdf(docDefinition)
    };
  }
};

function isNullCertificate(certificate: CertificateEth): boolean {
  return (
    certificate &&
    certificate.active == false &&
    certificate.createdAt <= 0 &&
    Number(certificate.id) === 0 &&
    certificate.student.name === '' &&
    certificate.updatedAt <= 0 &&
    certificate.waferNumber === ''
  );
}
