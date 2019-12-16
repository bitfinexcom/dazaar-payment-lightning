const lndGrpc = require('./lnd-grpc')
const through = require('through2')
const path = require('path')
const protoLoader = require('@grpc/proto-loader')
const fs = require('fs')

process.env.GRPC_SSL_CIPHER_SUITES = 'HIGH+ECDSA'

module.exports = class Payment {
  constructor (sellerAddress, users, lndRpc) {
    this.seller = sellerAddress
    this.settled = []
    this.pending = []
    this.sentPayments = []

    this.client = lndRpc
    this.users = users
    this.filter = filter(this.settled, this.pending, sellerAddress, this.users)
    this.invoiceStream = null
    this.lastIndex = 0
  }

  init () {
    const self = this
    const invoiceStream = this.client.subscribeInvoices({})

    invoiceStream.on('data', function (invoice) {
      const [label, buyer, seller] = invoice.memo.split(':')
      if (label !== 'dazaar') return

      if (seller === self.seller) {
        if (invoice.settled) {
          if (self.users.includes(buyer)) {
            self.settled.push({
              user: buyer,
              ref: invoice.memo,
              amount: parseInt(invoice.value),
              timestamp: parseInt(invoice.settle_date)
            })

            const index = self.pending.findIndex(item => {
              return item.payment_request === invoice.payment_request
            })
            self.pending.splice(index, 1)

            self.addInvoice(buyer, parseInt(invoice.value))
          }
        } else if (!self.users.includes(buyer)) {
          self.users.push(buyer)  
        }
      }
    })

    invoiceStream.on('end', function () {
      self.lastIndex = self.invoices.slice.pop().add_index
    })
  }

  update (cb) {
    if (!cb) cb = noop
    const self = this

    this.client.listInvoices({}, function (err, res) {
      if (err) cb(err)
      
      const dazaarPayments = res.filter(invoice =>
        invoice.memo.split(':')[0] === 'dazaar')

      self.settled = dazaarPayments
        .filter(invoice => invoice.settled)
        .map(invoice => ({
          ref: invoice.memo,
          amount: parseInt(invoice.value),
          timestamp: parseInt(invoice.settle_date)
        }))
      
      self.pending = dazaarPayments
        .filter(invoice => invoice.memo.split(':')[0] === 'dazaar')
        .filter(invoice => !invoice.settled)
      
      cb()
    })
  }

  addInvoice (buyer, amount, cb) {
    const self = this
    if (!cb) cb = noop

    this.client.addInvoice({
      memo: `dazaar:${buyer}:${this.seller}`,
      value: amount
    }, function (err, invoice) {
      if (err) return cb(err)

      // label invoice and add to outstanding payments
      self.pending.push(invoice)
      cb(null, invoice)
    })
  }

  validate (rate, user, cb) {
    if (!cb) cb = noop

    const userPayments = this.settled.filter(function (invoice) {
      return (invoice.ref.split(':')[1] === user)
    })

    const expiryTime = userPayments.reduce(timeToExpire, userPayments[0].timestamp)
    const timeLeft = expiryTime - Date.now() / 1000
    
    if (timeLeft <= 0) return cb(new Error('no time left.'))
    return cb (null, timeLeft)

    function timeToExpire (expiry, payment, index) {
      const timeAdded = (payment.amount / rate)
      if (payment.timestamp > expiry) return payment.timestamp + timeAdded

      return expiry + timeAdded
    }
  }

  payInvoice(paymentRequest, cb) {
    const self = this

    this.client.decodePayReq({
      pay_req: paymentRequest
    }, function (err, details) {
      if (err) cb(err)

      // invoice verification logic
      if (!details.description.split(':')[0] === 'dazaar') {
        reject('unrecognized invoice.')
      }

      const call = self.client.sendPayment()

      call.write({
        payment_request: paymentRequest
      })

      call.on('data', function (payment) {
        return cb(null, payment)
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

  shutdown () {
    const self = this
    this.invoiceStream.destroy()
    this.filter.destroy()
    grpc.closeClient(self.client)
    // console.log(this.invoiceStream)
  }
}

function filter (settled, pending, address, users) {
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

          // console.log(invoice, pending[0])
          const outstandingIndex = pending.findIndex(outstanding => {
            return outstanding.payment_request === invoice.payment_request })
          outstanding.splice(outstandingIndex, 1)
        }
      }
    }
    next()
  })
}

function noop () {}

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
  const packageDefinition = protoLoader.loadSync(
    opts.rpcProtoPath,
    { keepCase: true,
      longs: String,
      enums: String,
      defaults: true,
      oneofs: true
    })

  // pass the credentials when creating a channel
  const lnrpcDescriptor = grpc.loadPackageDefinition(packageDefinition)
  const lnrpc = lnrpcDescriptor.lnrpc
  return new lnrpc.Lightning(opts.port, credentials)
}
