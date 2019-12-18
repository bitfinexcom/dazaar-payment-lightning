const lndGrpc = require('./lnd-grpc')
const through = require('through2')
const path = require('path')
const { EventEmitter } = require('events')
const protoLoader = require('@grpc/proto-loader')
const fs = require('fs')

process.env.GRPC_SSL_CIPHER_SUITES = 'HIGH+ECDSA'

module.exports = class Payment {
  constructor (sellerAddress, lndRpc) {
    this.seller = sellerAddress
    this.settled = []
    this.pending = []
    this.sentPayments = []

    this.client = lndRpc
    this.users = null
    // this.filter = filter(this.settled, this.pending, sellerAddress, this.users)
    this.invoiceStream = this.client.subscribeInvoices({})
    this.lastIndex = 0
  }

  init (cb) {
    const self = this
    const invoiceStream = this.client.subscribeInvoices({}, cb)

    invoiceStream.on('end', function () {
      self.lastIndex = self.invoices.slice.pop().add_index
    })
  }

  connect (nodeId, host, port, cb) {
    const self = this

    this.client.listPeers({}, function (err, res) {
      if (res.peers.indexOf(peer => peer.pub_key = nodeId) >= 0) cb()

      const request = {
        addr: `${nodeId}@${host}:${port}`,
        perm: true
      }

      self.client.connect(request, cb)
    })
  }

  subscription (filter, rate) {
    const self = this
    let perSecond = 0

    if (typeof rate === 'object' && rate) { // dazaar card
      perSecond = convertDazaarPayment(rate)
    } else {
      const match = rate.trim().match(/^(\d(?:\.\d+)?)\s*BTC\s*\/\s*s$/i)
      if (!match) throw new Error('rate should have the form "n....nn BTC/s"')
      perSecond = Number(match[1])
    }

    const sub = new EventEmitter()

    let activePayments = []

    sub.synced = false
    sync(filter, activePayments)

    self.invoiceStream.on('data', filterInvoice)

    sub.active = function (minSeconds) {
      return sub.remainingFunds(minSeconds) > 0
    }

    sub.destroy = function () {
      sub.removeListener('data', filterInvoice)
    }

    sub.remainingTime = function (minSeconds) {
      const funds = sub.remainingFunds(minSeconds)
      return Math.floor(Math.max(0, funds / perSecond * 1000))
    }

    sub.remainingFunds = function (minSeconds) {
      if (!minSeconds) minSeconds = 0

      const now = Date.now() + minSeconds * 1000
      const funds = activePayments.reduce(leftoverFunds, 0)
      
      return funds

      function leftoverFunds (funds, payment, i) {
        const nextTime = i + 1 < activePayments.length ? activePayments[i + 1].time : now

        const consumed = perSecond * (nextTime - payment.time) / 1000
        funds += fromSats(payment.amount) - consumed

        return funds > 0 ? funds : 0
      }
    }

    return sub

    function filterInvoice (invoice) {
      if (invoice.memo !== filter || !invoice.settled) return

      const amount = parseInt(invoice.value)
      const time = parseInt(invoice.settle_date) * 1000

      activePayments.push({ amount, time })

      sub.emit('update')

      // repeat invoice
      self.addInvoice(filter, amount, relayToBuyer)
    }

    function sync () {
      self.client.listInvoices({}, function (err, res) {
        // CHECK: error handling
        if (err) throw err

        const dazaarPayments = res.invoices
          .filter(invoice => invoice.settled && invoice.memo === filter )

        const payments = dazaarPayments.map(payment => ({
          amount: parseInt(payment.value),
          time: parseInt(payment.settle_date) * 1000
        }))

        activePayments = [].concat(activePayments, payments)

        sub.synced = true
        sub.emit('synced')
      })
    }
  }

  addInvoice (filter, amount, cb) {
    const self = this
    if (!cb) cb = noop

    this.client.addInvoice({
      memo: filter,
      value: amount
    }, function (err, invoice) {
      if (err) return cb(err)

      // label invoice and add to outstanding payments
      self.pending.push(invoice)
      cb(null, invoice)
    })
  }

  payInvoice(paymentRequest, cb) {
    const self = this
    if (!cb) cb = noop

    this.client.decodePayReq({
      pay_req: paymentRequest
    }, function (err, details) {
      if (err) cb(err)

      // invoice verification logic
      if (!details.description.split(':')[0] === 'dazaar') {
        return cb(new Error('unrecognized invoice.'))
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
}

function noop () {}

function convertDazaarPayment (pay) {
  let ratio = 0

  switch (pay.unit) {
    case 'minutes':
      ratio = 60
      break
    case 'seconds':
      ratio = 1
      break
    case 'hours':
      ratio = 3600
      break
  }

  const perSecond = Number(pay.amount) / (Number(pay.interval) * ratio)
  if (!perSecond) throw new Error('Invalid payment info')
  return perSecond
}

function toSats (btcAmount) {
  return btcAmount * 10 ** 8
}

function fromSats (btcAmount) {
  return btcAmount / 10 ** 8
}
 
function relayToBuyer () {}

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
