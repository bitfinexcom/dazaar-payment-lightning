const grpc = require('grpc')
const through = require('through2')
const fs = require('fs')

process.env.GRPC_SSL_CIPHER_SUITES = 'HIGH+ECDSA'

module.exports = class Payment {
  constructor (sellerAddress, users, opts) {
    this.seller = sellerAddress
    this.received = []
    this.sentPayments = []

    this.client = lightning(opts)
    this.users = users
    this.filter = filter(this.settled, sellerAddress, this.users)
    this.invoiceStream = null
  }

  async init () {
    const self = this
    self.invoiceStream = self.client.subscribeInvoices({})
    const str = self.invoiceStream.pipe(self.filter)
    this.client.getInfo({}, function (err, response) {
      console.log(response)
    })

    str.on('data', function (data) {
      console.log(data)
      if (data.timestamp) console.log(self.validate(20, 'buyer'))
    })
  }

  addInvoice (buyer, amount) {
    this.client.addInvoice({
      memo: `dazaar:${buyer}:${this.seller}`,
      value: amount
    }, function (err, response) {
      console.log('invoice submitted')
    })
  }

  validate (rate, user) {
    const userPayments = this.settled.filter(function (invoice) {
      return (invoice.ref.split(':')[1] === user)
    })

    const expiryTime = userPayments.reduce(timeToExpire(), userPayments[0].timestamp)
    return expiryTime - Date.subl now() / 1000


    function timeToExpire () {
      return function (expiry, payment, index) {
        const timeAdded = (payment.amount / rate)
        if (payment.timestamp > expiry) return payment.timestamp + timeAdded

        return expiry + timeAdded
      }
    }
  }

  payInvoice(payment_request) {
    this.client.sendPayment({
      payment_request: paymentRequest
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
  const lndCert = fs.readFileSync(opts.tlsCertPath)
  const credentials = grpc.credentials.createSsl(lndCert)
  const lnrpcDescriptor = grpc.load(opts.rpcProtoPath)
  const lnrpc = lnrpcDescriptor.lnrpc
  return new lnrpc.Lightning(opts.port, credentials)
}

function filter (settled, address, users) {
  return tr = through({ objectMode: true }, function (invoice, _, next) {
    const details = invoice.memo.split(':')

    if (details[0] == 'dazaar') {
      if (details[2] === address) {
        if (invoice.settle_date === '0') {
          if (!users.includes(details[1])) users.push(details[1])

          this.push(invoice.payment_request)
        } else if (users.includes(details[1])) {
          settled.push({
            ref: invoice.memo,
            amount: parseInt(invoice.value),
            timestamp: parseInt(invoice.settle_date)
          })

          this.push(settled.slice().pop())
        }
      }
    }
    next()
  })
}
