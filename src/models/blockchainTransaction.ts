import { strict } from 'assert';
import dayjs from 'dayjs';
import 'dayjs/locale/es'; // import locale
import { BlockchainTransactionDto } from 'dto/blockchainTransactionDto';
import {
  Table,
  Model,
  Column,
  DataType,
  ForeignKey,
  BelongsTo,
  DefaultScope
} from 'sequelize-typescript';
import { Certificate } from './certificate';
import { Person } from './person';
import { Student } from './student';
dayjs.locale('es');

@DefaultScope(() => ({
  include: [
    {
      model: Certificate,
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
}))
@Table({
  timestamps: false,
  tableName: 'transaction'
})
export class BlockchainTransaction extends Model {
  @Column({
    type: DataType.INTEGER,
    autoIncrement: true,
    allowNull: false,
    primaryKey: true
  })
  id!: number;

  @Column({
    type: DataType.STRING,
    allowNull: false
  })
  transactionHash!: string;

  @ForeignKey(() => Certificate)
  @Column({
    type: DataType.INTEGER,
    allowNull: true
  })
  ceritificateId: number | undefined;

  @Column({
    type: DataType.INTEGER,
    allowNull: true
  })
  ceritificateBlockchainId: number | undefined;

  @Column({
    type: DataType.STRING,
    allowNull: false
  })
  status!: string;

  @Column({
    type: DataType.INTEGER,
    allowNull: true
  })
  blockNumber: number | undefined;

  @Column({
    type: DataType.STRING,
    allowNull: true
  })
  blockHash: number | undefined;

  @Column({
    type: DataType.STRING,
    allowNull: true
  })
  from: string | undefined;

  @Column({
    type: DataType.INTEGER,
    allowNull: true
  })
  gasUsed: number | undefined;

  @Column({
    type: DataType.DATE,
    allowNull: false
  })
  dateCreated!: Date;

  @Column({
    type: DataType.DATE,
    allowNull: false
  })
  dateModified?: Date;

  @BelongsTo(() => Certificate, 'ceritificateId')
  certificate!: Certificate;

  static toDtoList(
    transactions: BlockchainTransaction[]
  ): BlockchainTransactionDto[] {
    return transactions.map((t) => {
      return {
        transactionHash: t.transactionHash,
        certificate: Certificate.toDto(t.certificate),
        certificateBlockchainId: t.ceritificateBlockchainId,
        status: t.status,
        blockHash: t.blockHash,
        etherscanLink: this.createEtherscanLink(t.transactionHash),
        gasUsed: t.gasUsed,
        dateCreated: t.dateCreated
          ? dayjs(t.dateCreated).format('DD/MM/YYYY')
          : '',
        dateModified: t.dateModified
          ? dayjs(t.dateModified).format('DD/MM/YYYY')
          : ''
      } as BlockchainTransactionDto;
    });
  }

  private static createEtherscanLink(transactionHash: string): string {
    /**
     * Poner la dir de etherscan en una config por las dudas.
     */
    let ret = 'https://sepolia.etherscan.io/tx/';
    if (transactionHash && transactionHash.length > 0) {
      ret += transactionHash;
    }
    return ret;
  }
  // static toDto(certificate: Certificate): CertificateDto {
  //     return {
  //         id: certificate.id,
  //         student: Student.toDto(certificate.student),
  //         degreeType: certificate.degreeType,
  //         degreeName: certificate.degreeName,
  //         ministerialOrdinance: certificate.ministerialOrdinance,
  //         waferNumber: certificate.waferNumber,
  //         volumeNumber: certificate.volumeNumber,
  //         recordNumber: certificate.recordNumber,
  //         createdAt: certificate.createdAt,
  //         updatedAt: certificate.updatedAt,
  //         status: certificate.status,
  //     } as CertificateDto
  // }
}
