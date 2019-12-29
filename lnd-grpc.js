const grpc = require('grpc')
const path = require('path')
const protoLoader = require('@grpc/proto-loader')
const fs = require('fs')

process.env.GRPC_SSL_CIPHER_SUITES = 'HIGH+ECDSA'

module.exports = lightningRpc

/* opts = {
  lnddir,
  network,
  port
} */

const packageDefinition = protoLoader.loadSync(
  __dirname + '/rpc.proto',
  { keepCase: true,
    longs: String,
    enums: String,
    defaults: true,
    oneofs: true
  }
)

function lightningRpc (opts) {
  // load macaroon from .lnd directory
  const macaroonPath = path.join(opts.lnddir, 'data', 'chain', 'bitcoin', opts.network, 'admin.macaroon')
  const m = fs.readFileSync(macaroonPath)
  const macaroon = m.toString('hex')

  // build metadata credentials
  const metadata = new grpc.Metadata()
  metadata.add('macaroon', macaroon)
  const macaroonCreds = grpc.credentials.createFromMetadataGenerator((_args, callback) => {
    callback(null, metadata)
  })

  // build ssl credentials
  const tlsCertPath = path.join(opts.lnddir, 'tls.cert')
  const lndCert = fs.readFileSync(tlsCertPath)
  const sslCreds = grpc.credentials.createSsl(lndCert)

  // combine cert credentials and macaroon auth credentials
  const credentials = grpc.credentials.combineChannelCredentials(sslCreds, macaroonCreds)

  // pass the credentials when creating a channel
  const lnrpcDescriptor = grpc.loadPackageDefinition(packageDefinition)
  const lnrpc = lnrpcDescriptor.lnrpc
  return new lnrpc.Lightning(opts.port, credentials)
}
