const grpc = require('grpc')
const through = require('through2')
const path = require('path')
const fs = require('fs')

process.env.GRPC_SSL_CIPHER_SUITES = 'HIGH+ECDSA'

module.exports = class Payment {
  constructor (sellerAddress, users, opts) {
    this.seller = sellerAddress
    this.settled = []
    this.outstanding = []
    this.sentPayments = []

    this.client = lightning(opts)
    this.users = users
    this.filter = filter(this.settled, this.outstanding, sellerAddress, this.users)
    this.invoiceStream = null
  }

  async init () {
    const self = this
    self.invoiceStream = self.client.subscribeInvoices({})
    const str = self.invoiceStream.pipe(self.filter)

    str.on('data', function (data) {
      console.log(data)
      if (data.timestamp) console.log(self.validate(20, 'buyer'))
    })
  }

  async addInvoice (buyer, amount) {
    const self = this

    return new Promise((resolve, reject) => {
      this.client.addInvoice({
        memo: `dazaar:${buyer}:${this.seller}`,
        value: amount
      }, function (err, invoice) {
        if (err) reject(err)

        self.outstanding.push(invoice)
        console.log('invoice submitted')
        resolve(invoice)
      })
    })
  }

  validate (rate, user) {
    const userPayments = this.settled.filter(function (invoice) {
      return (invoice.ref.split(':')[1] === user)
    })

    const expiryTime = userPayments.reduce(timeToExpire(), userPayments[0].timestamp)
    return expiryTime - Date.now() / 1000


    function timeToExpire () {
      return function (expiry, payment, index) {
        const timeAdded = (payment.amount / rate)
        if (payment.timestamp > expiry) return payment.timestamp + timeAdded

        return expiry + timeAdded
      }
    }
  }

  async payInvoice(paymentRequest) {
    const self = this

    return new Promise((resolve, reject) => {
      this.client.decodePayReq({
        pay_req: paymentRequest
      }, function (err, details) {
        if (err) reject(err)

        // invoice verification
        if (!details.description.split(':')[0] === 'dazaar') {
          reject('unrecognized invoice.')
        }

        const call = self.client.sendPayment()

        call.write({
          payment_request: paymentRequest
        })

        call.on('data', function (payment) {
          call.end()
          resolve(payment)
        })
      })
    })
  }

  earnings () {
    const earnings = {}
    for (let user of this.users) {
      earnings[user] = this.settled.reduce(function (acc, payment) {
        if (payment.ref.split(':')[1] !== user) return acc
        return acc + payment.amount
      }, 0)
    }
    return earnings
  }
}

function lightning (opts) {
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
  const lnrpcDescriptor = grpc.load(opts.rpcProtoPath)
  const lnrpc = lnrpcDescriptor.lnrpc
  return new lnrpc.Lightning(opts.port, credentials)
}

function macaroon (lndDir) {
  const macaroonPath = path.join(opts.lnddir, 'data', 'chain', 'bitcoin', opts.network, 'admin.macaroon')
  const m = fs.readFileSync(macaroonPath)
  const macaroon = m.toString('hex')

  const metadata = new grpc.meta
}

function filter (settled, outstanding, address, users) {
  return tr = through({ objectMode: true }, function (invoice, _, next) {
    const details = invoice.memo.split(':')

    if (details[0] == 'dazaar') {
      if (details[2] === address) {
        if (invoice.settle_date === '0') {
          if (!users.includes(details[1])) {
            users.push(details[1])
          }
        } else if (users.includes(details[1])) {
          settled.push({
            ref: invoice.memo,
            amount: parseInt(invoice.value),
            timestamp: parseInt(invoice.settle_date)
          })

          // console.log(invoice, outstanding[0])
          const outstandingIndex = outstanding.findIndex(outstanding => {
            return outstanding.payment_request === invoice.payment_request })
          outstanding.splice(outstandingIndex, 1)
        }
      }
    }
    next()
  })
}
