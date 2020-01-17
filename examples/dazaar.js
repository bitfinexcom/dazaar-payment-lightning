const Lightning = require('../lightning.js')
const hypercore = require('hypercore')
const pump = require('pump')
const market = require('../../dazaar/market')

const lndOpts2 = {
  lnddir: './.lnd2',
  rpcPort: 'localhost:13009',
  address: '127.0.0.1:9731',
  network: 'regtest',
  implementation: 'lnd'
}

const lndOpts1 = {
  lnddir: './.lnd1',
  rpcPort: 'localhost:12009',
  address: '127.0.0.1:9734',
  network: 'regtest',
  implementation: 'lnd'
}

const cOpts2 = {
  lightningdDir: '.c2',
  address: '127.0.0.1:9732',
  network: 'regtest',
  implementation: 'c-lightning'
}

const cOpts1 = {
  lightningdDir: './.c1',
  address: '127.0.0.1:9733',
  network: 'regtest',
  implementation: 'c-lightning'
}

const dazaarParameters = {
  payto: 'dazaartest22',
  currency: 'LightningSats',
  amount: '100',
  unit: 'seconds',
  interval: 1
}

const m = market('./tmp')

const feed = hypercore('./tmp/data1')

let sellerLnd
let buyerLnd

feed.append('valuable')

const seller = m.sell(feed, {
  validate (remoteKey, cb) {
    console.log('this key wants our hypercore 1', remoteKey)
    sellerLnd.validate(remoteKey, cb)
  }
})

seller.ready(function (err) {
  if (err) throw err // Do proper error handling

  const buyer = m.buy(seller.key)

  sellerLnd = new Lightning.seller(seller, dazaarParameters, cOpts2)  
  buyerLnd = new Lightning.buyer(buyer, cOpts1)

  buyer.on('validate', function () {
    console.log('remote validated us')
  })

  buyer.on('feed', function () {
    console.log('got feed!')

    buyer.feed.createReadStream({ live: true })
      .on('data', console.log)
  })

  const stream = seller.replicate()

  pump(stream, buyer.replicate(), stream, function (err) {
    console.log('replication ended', err)
  })

  setImmediate(function () {
    // buying flow
    buyerLnd.buy(1000, function (err) {
      repeatValidate()
    })

    // unrecognised invoice will be rejected
    // setTimeout(() => {
    //   sellerLnd.lightning.addInvoice('dazaar: unrecognised', 800, function (err, invoice) {
    //     buyerLnd.pay(invoice, function (err) {
    //       console.error(err)
    //     })
    //   })
    // }, 2000)

    function repeatValidate (err) {
      if (err) console.error(err)
      sellerLnd.validate(buyer.key, function (err, info) {
        console.log(err, info)
        setTimeout(repeatValidate, 2000)
      })
    }
  })
})
