import Web3 from 'web3';
import { Contract } from 'web3-eth-contract';
import { TransactionReceipt, TransactionConfig, Account, SignedTransaction } from 'web3-core';
import { AbiInput} from 'web3-utils';
import { CertificateEth, fromDto } from '../../models/blockchain/certificateEth';
import { notificationService } from '../../services/notifications/notificationService';
import { NetworkStatusDto } from 'dto/notificationDto';


const URL_GANACHE = 'http://127.0.0.1:7545';
const URL_INFURA = 'https://ropsten.infura.io/v3/04be9cd572fa4376a643b4b78aaa7498';

const contractArtifact = require('../../../../blockchain/certificateContract/build/contracts/Certificates.json');

class Web3Service {
    private _web3!: Web3;
    //   leer del archivo de configuracion la billetera.
    contactAddress: string = '0xA6fD1e205b51a6e6BF22533f853c50e37C1D776f';

    readonly certificateContract: Contract | undefined = undefined;
    certificates = [];
    networkId: number = 0;

    public get web3(): Web3 {
        return this._web3;
    }
    public set web3(value: Web3) {
        this._web3 = value;
    }

    constructor() {
        this.web3 = new Web3(URL_GANACHE);
        this.certificateContract = this.getCertificateContract();
        
    }
    connectNetwork(){
        this.web3.setProvider(new Web3.providers.HttpProvider(URL_GANACHE));
        this.web3.eth.net.getId().then((id: number) => {
            this.networkId = id;
            console.log('Blockchain conectada');
        });
    }

    private getCertificateContract() {
        const abi = contractArtifact.abi;
        const certificateContract = new this.web3.eth.Contract(abi, process.env.CONTRACT_ADDRESS_Ganache);
        return certificateContract;
    }

    async getCertificatesByStudentId(id: number) {
        return await this.certificateContract!.methods.getCertificatesByStudentId(id).call() as Promise<any>;
    }

    async getAmountCertificates() {
        return this.certificateContract!.methods.amountCertificates().call() as Promise<any>;
    }

    async sendTransaction(signed: SignedTransaction) {
        let receipt = null;
        let blockchainCertificate: Partial<CertificateEth> | null = null;
        
        // Todo: agregar gestion de eventos. No se va a poder usar ese await.
        try {
            receipt = await this.web3.eth.sendSignedTransaction(signed.rawTransaction!) as TransactionReceipt;
        } catch (e) {
            throw e;
        }
        if (receipt) {
            blockchainCertificate = this.decodeTransactionLog(receipt)
        }
        return [blockchainCertificate, receipt] as const;
    }

    private decodeTransactionLog(receipt:TransactionReceipt): Partial<CertificateEth>{
        // Topico del log de la transaccion
        const topics = receipt?.logs[0].topics;
        const logCodedData = receipt?.logs[0].data || '';
        // Inputs del metodo del contrato que seran parseados en el log.

        const abiInputs:AbiInput[] = [
            {type:'uint256',name:'id'},
            {type:'uint256',name:' createdAt'},
            {type:'uint256',name:' updatedAt'},
        ]
        const logData = this.web3.eth.abi.decodeLog(abiInputs, logCodedData,topics!);
        const cert = this.createEthCertificate(logData);

        return cert;
    }

    createEthCertificate(logData:{[key: string]: string;}): Partial<CertificateEth>{
        const cert:Partial<CertificateEth> = {
            id: logData.id ?  Number(logData.id) : 0,
            createdAt: logData.createdAt ?  Number(logData.createdAt) : 0,
            updatedAt:logData.updatedAt ?  Number(logData.updatedAt) : 0,
        }
        return cert
    }

    async createSignTransaction(certificate: CertificateEth): Promise<SignedTransaction> {
        // Importante que la creacion de la cuenta sea local en el metodo. Para evitar que sea expuesta.
        const account: Account = this.web3.eth.accounts.privateKeyToAccount(process.env.PRIVATE_KEY_WALLET1_GANACHE!);
        if (account) {
            // Creo la transaccion con el metodo a ejecutar del smart-contract con su data.
            const transaction = this.certificateContract!.methods.createCertificate(certificate);

            // Calculo el gas estimado de la transaccion.
            const gas = await transaction.estimateGas({ from: account?.address! });

            // Codifico la transaccion para ser firmada.
            const data = transaction.encodeABI();

            // Obtengo el numero de transacciones de la cuenta.
            const nonce = await this.web3.eth.getTransactionCount(account?.address!);

            // Creo la configuracion de la transaccion con los datos para ser firmada.
            const options = {
                to: transaction._parent._address,
                data: data,
                nonce: nonce,
                gas: gas,
                gasPrice: 55000,
            } as TransactionConfig;

            // Firmo la transaccion con la clave privada.
            const signed = await this.web3.eth.accounts.signTransaction(options, account.privateKey!);
            return signed;
        } else {
            throw new Error('Ocurrio un error al firmar la transaccion. Revise sus parametros.')
        }  
    }
    
    getNetworkStatus(){
        let status:NetworkStatusDto = {
            networkId: 0,
            blockchainName: '',
            connected: false
        }
        if(this.networkId && this.web3 && this.web3.currentProvider){
            status = {
                networkId: this.networkId,
                blockchainName: this.web3.currentProvider?.toString(),
                connected: true
            }
        }
        notificationService.sendNotification(1,status);
    }
}

export const web3Service = new Web3Service();



 // const rawTx = {
        //     to: transaction._parent._address,
        //     data: data,
        //     nonce: this.web3.utils.toHex(nonce),
        //     gasPrice: this.web3.utils.toHex(this.web3.utils.toWei('2', 'gwei')),
        //     gasLimit: this.web3.utils.toHex(55000),
        // } as TxData

        // const common = new Common({ chain: Chain.Ropsten })
        // const tx = Transaction.fromTxData(rawTx, { common })

        // const signedTx = tx.sign(this.privateKey)

        // const serializedTx = signedTx.serialize()


        // async function send() {
        //     const web3        = new Web3(YOUR_NODE_ADDRESS);
        //     const contract    = new web3.eth.Contract(YOUR_CONTRACT_ABI, YOUR_CONTRACT_ADDRESS);
        //     const account     = web3.eth.accounts.privateKeyToAccount(YOUR_PRIVATE_KEY);
        //     const transaction = contract.methods.notarizeHash(YOUR_ID, YOUR_DOCUMENT_HASH);
        
        //     const options  = {
        //         to      : transaction._parent._address,
        //         data    : transaction.encodeABI(),
        //         gas     : await transaction.estimateGas({from: account.address}),
        //         gasPrice: WHATEVER_GAS_PRICE_YOU_ARE_WILLING_TO_PAY
        //     };
        
        //     const signed  = await web3.eth.accounts.signTransaction(options, account.privateKey);
        //     const receipt = await web3.eth.sendSignedTransaction(signed.rawTransaction);
        
        //     return receipt;
        // }