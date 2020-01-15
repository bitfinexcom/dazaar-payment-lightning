const Lightning = require('../lightning.js')
const hypercore = require('hypercore')
const pump = require('pump')
const market = require('../../dazaar/market')

const lndOpts2 = {
  lnddir: './.lnd2',
  rpcPort: 'localhost:13009',
  host: '127.0.0.1:9731',
  network: 'regtest'
}

const lndOpts1 = {
  lnddir: './.lnd1',
  rpcPort: 'localhost:12009',
  host: '127.0.0.1:9734',
  network: 'regtest'
}

const cOpts2 = {
  lightningdDir: '.c2',
  host: '127.0.0.1:9732',
  network: 'regtest'
}

const cOpts1 = {
  lightningdDir: './.c1',
  host: '127.0.0.1:9733',
  network: 'regtest'
}

const dazaarParameters = {
  payto: 'dazaartest22',
  currency: 'LightningBTC',
  amount: '0.02',
  unit: 'hours',
  interval: 1
}

const m = market('./tmp')

const feed = hypercore('./tmp/data')

let sellerLnd
let buyerLnd

feed.append('valuable')

const seller = m.sell(feed, {
  validate (remoteKey, cb) {
    // seller.validate(remoteKey.toString('hex'))
    console.log('this key wants our hypercore', remoteKey)
    sellerLnd.validate(remoteKey, cb)
  }
})

seller.ready(function (err) {
  if (err) throw err // Do proper error handling

  const buyer = m.buy(seller.key)

  sellerLnd = new Lightning(seller, dazaarParameters, { implementation: 'lnd', info: lndOpts1 })
  buyerLnd = new Lightning(buyer, dazaarParameters, { implementation: 'lnd', info: lndOpts2 })

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
    buyerLnd.buy(800, seller.key, function (err) {
      sellerLnd.validate(buyer.key, function (err, info) {
        console.log(err, info)
      })
    })
  })

  setTimeout(repeatBuy, 5000, 800, 5000)  

  function repeatBuy (amount, interval) {
    buyerLnd.buy(amount, seller.key, function (err) {
      sellerLnd.validate(buyer.key, function (err, info) {
        console.log(err, info)
        setTimeout(() => repeatBuy(amount, interval), interval)
      })
    })
  }
})
