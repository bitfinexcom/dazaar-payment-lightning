# dazaar-payment-lightning
Lightning payment api for Dazaar stream services

## Usage
### Options
```js
const lightningOpts = {
  cert: ..., // base64 encoded string of tls.cert
  macaroon: ..., // base64 encoded string of macaroon
  network: ..., // mainnet / testnet / regtest
  implementation: ..., // 'c-lightning' or 'lnd'
  oninvoice: function (invoice) {
    // handle incoming invoice, e.g. display as QR
  }
}

const paymentCard = {
  currency: 'LightningBTC', // may also be LightningSats
  amount: '0.002',
  unit: 'hours',
  interval: 1,
  minSeconds: 1, // minimum amount of streamtime
}
```

### Seller
```js
const Payment = require('dazaar-payment-lightning')
const market = require('dazaar/market')
const hypercore = require('hypercore')

const m = market('./tmp')
const feed = hypercore('./tmp/data')

let payment

// instantiate a seller for a feed and equip it
// with a validate function
const seller = m.sell(feed, {
  validate (remoteKey, cb) {
    payee.validate(remoteKey, cb)
  }
})

seller.ready(function (err) {
  payment = new Payment(seller, paymentCard, lightningOpts)
  
  // payment now set up. dazaar logic follows ... 
})
```

### Buyer
On a separate machine with the  
```js
// instantiate a buyer for a specific feed 
const buyer = m.buy(seller.key)

// set up pay payment linked to the buyer
const payment = new Payment(buyer, null, lightningOpts)

// buy an amount of feed
payment.buy(800) // oninvoice handles response
```

## API
#### `const payment = Payment(seller, payment, options)`
Create a new lightning payment instance associated to a seller. `seller` should be a dazaar seller instance, `payment` may either be a dazaar payment card, or a string specifying the per second rate in either `BTC` or `Sats`, such as `200 Sats/s`. Options include:
```js
{
  cert: ..., // base64 encoded string of tls.cert
  macaroon: ..., // base64 encoded string of macaroon
  network: ..., // mainnet / testnet / regtest
  implementation: ..., // 'c-lightning' or 'lnd'
  oninvoice: function (invoice) {
    // handle incoming invoice, e.g. display as QR
  }
}
```

#### `payment.validate(buyerKey, cb)`
A seller can validate the time left for a given buyer. Returns `error` if there is no time left on the subscription. The method shall check whether the given buyer has a subscription set-up and instantiate one not already present.

#### `payment.destroy()`
Destroy the payment provider

#### `payment.buy(amount)`
Request a specified amount for the stream that this buyer is registered to. `amount` is specified in satoshis (1 x 10<sup>-8</sup> BTC). The invoice is passed to the user so there is no need for a lightning node to be connected in order to call this API. `oninvoice` handles the returned invoice, which is passed to the constructor.

#### `payment.destroy()`
Destroy the payment provider

## Setup

Refer to the [setup guide](SETUP.md) for instructions on how to install a lightning node implementation and set up a test environment.

## License
MIT
