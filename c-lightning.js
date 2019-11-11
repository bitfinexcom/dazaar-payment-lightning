const CLightning = require('@jbaczuk/c-lightning-rpc')

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
    self.client.listchannels().then(console.log)
    self.addInvoice('buyer', 2000)
  }

  addInvoice (buyer, amount) {
    const self = this
    
    const label = Date.now()
    const amountMsat = amount * 1000
    const description = `dazaar:${buyer}:${this.seller}`
    
    this.client.invoice(amountMsat, label, description)
      .then(response => {
        const invoice = JSON.parse(response).result

        self.outstanding.push(invoice)
        console.log('invoice submitted')
        console.log(label)

        self.client.waitinvoice(label).then(response => {
          const payment = JSON.parse(response).result
          self.received.push({
            ref: payment.description,
            amount: parseInt(payment.msatoshi) / 1000,
            timestamp: parseInt(payment.paid_at)
          })
        })
      })
  }

  validate (rate, user) {
    if (!this.received.length) return 0
    console.log(this.received)
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
