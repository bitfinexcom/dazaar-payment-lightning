const WebSocket = require('ws')
const EclairClient = require('eclair-rpc')
const querystring = require('querystring')
const http = require('http')
const got = require('got')

module.exports = class Payment {
  constructor (sellerAddress, users, opts) {
    this.seller = sellerAddress
    this.users = users

    this.received = []
    this.outstanding = {}
    this.sentPayments = []

    console.log(opts.hostname)
    this.hostname = opts.hostname
    this.port = opts.port
    this.rpc = new EclairClient

    this.user = opts.user
    this.pass = opts.password
    this.auth = new Buffer(':' + this.pass).toString('base64')

    this.websocket = new WebSocket(`ws://localhost:8081/ws`, {
      headers: {
        'Authorization': 'Basic' + this.auth
      }
    })
  }

  async init () {
    const self = this
    // this.websocket.on('connectFailed', function (err) {
    //   console.log('Failed to connect to lightning node')
    //   console.error(err)
    // })

    // this.websocket.on('connect', function (constnnection) {
    //   console.log('Lightning node connected!')
      
    //   connection.on('error', function (err) {
    //     console.log('Connection Error: ' + error.toString)
    //   })

    //   connection.on('close', function () {
    //     console.log('Lightning node disconnected.')
    //   })
      
    this.websocket.on('message', function (message) {
      if (message.type === 'payment-received') {
        console.log(message)
        const payment = JSON.parse(message)
        self.received.push({
          hash: payment.paymentHash,
          amount: payment.amount,
          timestamp: payment.timestamp
        })
      }
    })
  

    // this.websocket.connect(`ws://localhost:8080/`, {
    //   headers: {
    //     'Authorization': 'Basic' + auth
    //   }
    // })
  }

  async listPeers () {
    const self = this

    const opts = {
      hostname: this.hostname,
      port: this.port,
      method: 'POST',
      path: '/peers',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'Authorization': 'Basic' + this.auth
      }
    }

    const req = http.request(opts, function (res) {
      res.on('data', function (data) {
        JSON.parse(data)
      })
    })

    req.on('error', console.error)
    req.write('')
    req.end()
  }

  async getInfo () {
    const self = this

    const opts = {
      hostname: this.hostname,
      port: this.port,
      path: '/getinfo',
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'Authorization': 'Basic' + this.auth
      }
    }

    // fetch('http://localhost:8081/getinfo', opts)
    //   .then(data => {
    //     console.log('h')
    //     data.json()
    //   })
    //   .then(console.log)
    //   .catch(console.error)

    const req = http.request(opts, function (res) {
      res.on('data', function (data) {
        console.log(JSON.parse(data))
      })
    })

    req.on('error', console.error)
    req.write('')
    req.end()
  }

  async pay (invoice) {
    const data = querystring.stringify({
      invoice: invoice
    })

    const opts = {
      hostname: this.hostname,
      port: this.port,
      method: 'POST',
      path: '/payinvoice',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'Content-Length': data.length,
        'Authorization': 'Basic' + this.auth
      }
    }

    const req = http.request(opts, function (res) {
      res.on('data', function (data) {
        console.log(JSON.parse(data))
      })
    })

    req.on('error', console.error)
    req.write(data)
    req.end()
  }

  async connect (uri) {
    const data = querystring.stringify({
      uri: uri
    })

    const opts = {
      hostname: this.hostname,
      port: this.port,
      method: 'POST',
      path: '/connect',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'Content-Length': data.length,
        'Authorization': 'Basic' + this.auth
      }
    }

    const req = http.request(opts, function (res) {
      res.on('data', function (data) {
        console.log(JSON.parse(data))
      })
    })

    req.on('error', console.error)
    req.write(data)
    req.end()
  }

  async addInvoice (buyer, amount) {
    const self = this

    const amountMsat = amount * 1000
    const description = `dazaar`
    
    const data = querystring.stringify({
      description: description,
      amountMsat: amountMsat
    })

    const auth = new Buffer(':' + this.pass).toString('base64')

    const opts = {
      hostname: this.hostname,
      port: this.port,
      method: 'POST',
      path: '/createinvoice',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'Content-Length': data.length,
        'Authorization': 'Basic' + auth
      }
    }

    const req = http.request(opts, function (res) {
      res.on('data', function (data) {
        const invoice = JSON.parse(data)
        console.log(invoice)

        const rHash = invoice.paymentHash
        const paymentRef = invoice.description

        self.outstanding[rHash] = paymentRef
      })
    })

    req.on('error', console.error)
    req.write(data)
    req.end()
  }
}
