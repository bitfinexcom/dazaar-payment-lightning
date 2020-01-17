# dazaar-lightning
Lightning payment api for Dazaar stream services

## Usage
### Options
```js
const lightningOpts = {
  lnddir: ..., // data directory of the lightning node
  rpcPort: ..., // only needed for LND
  address: ..., // format <host>:<port>
  network: ..., // mainnet / testnet / regtest
  implementation: ... // 'c-lightning' or 'lnd'
}

const dazaarParameters = {
  payto: 'dazaartest22',
  currency: 'LightningBTC',
  amount: '0.002',
  unit: 'hours',
  interval: 1
}
```

### Seller
```js
const Payment = require('dazaar-ln-payment')
const market = require('dazaar/market')
const hypercore = require('hypercore')

const m = market('./tmp')
const feed = hypercore('./tmp/data')

let pay

// instantiate a seller for a feed and equip it
// with a validate function
const seller = m.sell(feed, {
  validate (remoteKey, cb) {
    pay.validate(remoteKey, cb)
  }
})

seller.ready(function (err) {
  pay = new Payment(seller, paymentCard, lightningOpts)
  
  // payment now set up. dazaar logic follows ... 
})
```

### Buyer
On a separate machine with the  
```js
// instantiate a buyer for a specific feed 
const buyer = m.buy(seller.key)

// set up pay payment linked to the buyer
const pay = Payment(buyer, paymentCard, lightningOpts)

// buy an amount of feed
pay..buy(800, cb)
```

## API
`const pay = dazaarLightning(actor, payment, options)`
Create a new lightning payment instance associate to an actor (seller/buyer). `actor` should be a dazaar buyer or seller, `paymentCard` should be a dazaar payment card. Options include:
```js
{
  lnddir: ..., // data directory of the lightning node
  rpcPort: ..., // only needed for LND
  address: ..., // format <host>:<port>
  network: ..., // mainnet / testnet / regtest
  implementation: ... // 'c-lightning' or 'lnd'
}
```

`pay.buy(amount, cb)`
A buyer can pay a specified amount for the stream that this buyer is registered to. `amount` shall be in the units specified by the payment info given at instantiation. Because a new buyer is instatiated for each stream, there is no need to specify more than the amount to be purchased.

`pay.validate(buyerKey, cb)`
A seller can validate the time left for a given buyer. Returns `error` if there is no time left on the subscription. The method shall check whether the given buyer has a subscription set-up and instantiate one not already present.

`pay.destroy()`
Destroy the payment provider

## License
MIT
