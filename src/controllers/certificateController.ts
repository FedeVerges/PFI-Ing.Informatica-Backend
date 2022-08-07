import { Request, Response } from "express";
import { getErrorMessage } from "../utils/manageError";
import { UserService } from "../services/user/userService";
import { CertificateDto } from "dto/certificateDto";
import { CertificateService } from "../services/certificates/certificatesService";
import { StudentService } from "../services/student/studentService";
import { web3Service } from "../services/web3/web3Service";
import { TransactionDto } from "dto/transactionDto";

export const certificateController = {

    async create(req: Request, res: Response) {
        try {
            validateFields(req.body);
            const newCertificate = await web3Service.createCertificate(req.body as CertificateDto);
            const transactionRes = {
                receipt: newCertificate,
                certificate: req.body
            } as TransactionDto
            // const newCertificate = await CertificateService.createCertificate(req.body as CertificateDto);
            res.status(200).json(transactionRes);
        } catch (error) {
            console.log(error)
            res.setHeader('Content-Type', 'application/json');
            res.status(409).json(getErrorMessage(error));
        }
    },

    async delete(req: Request, res: Response) {
        try {

        } catch (error) {
            res.setHeader('Content-Type', 'application/json');
            res.status(409).json(getErrorMessage(error));
        }
    },
    async getAll(req: Request, res: Response) {
        try {
            const certificates = await CertificateService.getAllCertificates();
            res.status(200).json(certificates);
        } catch (error) {
            res.setHeader('Content-Type', 'application/json');
            res.status(409).json(getErrorMessage(error));
        }
    },
    async getByDocNumber(req: Request, res: Response) {
        try {
            const studentDocNumber = req.params.docNumber;
            // const student = await StudentService.getStudentByDocNumber(studentDocNumber);
            
            // const certificates = await CertificateService.getCertificatesByStudentId(Number(studentDocNumber));
            const certificates = await web3Service.getCertificatesByStudentId(Number(studentDocNumber));
            res.status(200).json(certificates);
        } catch (error) {
            res.setHeader('Content-Type', 'application/json');
            res.status(409).json(getErrorMessage(error));
        }
    },
}

function validateFields(certificate: CertificateDto) {
    if (!certificate.institutionId) {
        throw new Error('Debe seleccionar una institucion');
    }
    if (!certificate.degreeName) {
        throw new Error('Debe ingresar el nombre de la carrera');
    }
    if (!certificate.student) {
        throw new Error('Debe ingresar los datos del estudiante');
    }
    if (!certificate.student.name) {
        throw new Error('Debe seleccionar una institucion');
    }
    if (!certificate.student.docNumber) {
        throw new Error('Debe el numero de documento del estudiante');
    }
}
