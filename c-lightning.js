const CLightning = require('@jbaczuk/c-lightning-rpc')
const sodium = require('sodium-native')

module.exports = class Payment {
  constructor (sellerAddress, users, opts) {
    this.seller = sellerAddress
    this.received = []
    this.outstanding = []
    this.sentPayments = []

    this.client = new CLightning(opts.lightningdPath)
    this.users = users
  }

  async init () {
    const self = this

    // .then(info => console.log(JSON.parse(info).result))
    return self.client.listchannels()
    // self.addInvoice('buyer', 2000)
  }

  async addInvoice (buyer, amount) {
    const self = this
    
    // generate unique label per invoice
    const tag = `${buyer}:${Date.now()}`
    const labelBuf = Buffer.alloc(sodium.crypto_generichash_BYTES)
    sodium.crypto_generichash(labelBuf, Buffer.from(tag))
    const label = labelBuf.toString('base64')

    const amountMsat = amount * 1000
    const description = `dazaar:${buyer}:${this.seller}`
    
    return this.client.invoice(amountMsat, label, description)
      .then(response => {
        // set client to listen for payment and
        // mark the invoice as received upon payment
        self.client.waitinvoice(label).then(response => {

          const payment = JSON.parse(response).result
          self.received.push({
            ref: payment.description,
            amount: parseInt(payment.msatoshi) / 1000,
            timestamp: parseInt(payment.paid_at)
          })

          // find index of the outstanding invoice being paid
          const outstandingIndex = self.outstanding.findIndex((invoice) => {
            return invoice.payment_hash === payment.payment_hash
          })
          
          // remove invoice from outstanding invoices
          self.outstanding.splice(outstandingIndex, 1)
        })

        // parse invoice
        const invoice = JSON.parse(response).result

        // mark the invoice as outstanding
        self.outstanding.push(invoice)
        console.log('invoice submitted')

        return invoice
      })
  }

  validate (rate, user) {
    if (!this.received.length) return 0
    const userPayments = this.received.filter(function (invoice) {
      return (invoice.ref.split(':')[1] === user)
    })

    const expiryTime = userPayments.reduce(timeToExpire, userPayments[0].timestamp)
    return expiryTime - Date.now() / 1000


    function timeToExpire (expiry, payment, index) {
      const timeAdded = (payment.amount / rate)

      if (payment.timestamp > expiry) return payment.timestamp + timeAdded
      return expiry + timeAdded
    }
  }

  payInvoice(paymentRequest) {
    const self = this
    self.client.pay(paymentRequest)
      .then(self.sentPayments.push(paymentRequest))
  }

  earnings () {
    const earnings = {}
    for (let user of this.users) {
      earnings[user] = this.received.reduce(function (acc, payment) {
        if (payment.ref.split(':')[1] !== user) return acc
        return acc + payment.amount
      }, 0)
    }
    return earnings
  }
}
