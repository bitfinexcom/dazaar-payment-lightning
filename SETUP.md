
# Setup
A guide to setting up and connecting lightning nodes on bitcoin regtest network for testing purposes.

## bitcoind
If bitcoind is not already running on regtest network, we need to set this up.

For testing purposes it is easiest to set up a new directory:
```sh
$ mkdir .regtest
```

Now create a `bitcoin.conf` file in the `.regtest` directory with the following settings:
```
regtest=1

server=1
daemon=1
txindex=1

# user: lnd | password: password
rpcauth=lnd:98670aa7dba2e75ef79c0583e929dd23$29cd17464f672688ca01b47fbf6bdfe49352cb8e90937dee7de0ddd76dc33e0d 
zmqpubrawblock=tcp://127.0.0.1:28332
zmqpubrawtx=tcp://127.0.0.1:28333
```

To use your own authorisation info you can use bitcoin-rpcauth:
```sh
$ npm i -g bitcoin-rpcauth
$ rpcauth --username=<username> --password=<password>
# copy the returned string into bitcoin.conf
``` 

Start `bitcoind`:
```sh
$ bitcoind --datadir=.regtest
```

Check that `bitcoind` is up and running:
```sh
$ bitcoin-cli --rpcpassword=password --rpcuser=lnd --regtest getblockcount # should be 0 at this point
```

## Install LND

Install LND from source using the following instructions for MacOS taken from the LND [INSTALL.md](https://github.com/lightningnetwork/lnd/blob/master/docs/INSTALL.md):

Install dependencies:

​	Go:

```sh
$ brew install go@1.13
```

At this point, you should set your `$GOPATH` environment variable, which represents the path to your workspace. By default, `$GOPATH` is set to `~/go`. You will also need to add `$GOPATH/bin` to your `PATH`. This ensures that your shell will be able to detect the binaries you install.

```sh
$ export GOPATH=~/gocode
$ export PATH=$PATH:$GOPATH/bin
```

- We recommend placing the above in your .bashrc or in a setup script so that you can avoid typing this every time you open a new terminal window.

With the preliminary steps completed, to install `lnd`, `lncli`, and all related dependencies run the following commands:

```sh
$ go get -d github.com/lightningnetwork/lnd
$ cd $GOPATH/src/github.com/lightningnetwork/lnd
$ make && make install
```

To check that `lnd` was installed properly run the following command:

```sh
$ make check
```

## Install c-lightning

 Install c-lightning from source using the following instructions for MacOS taken from the c-lightning [INTALL.md](https://github.com/ElementsProject/lightning/blob/master/doc/INSTALL.md):

Install dependencies: 

```sh
$ brew install autoconf automake libtool python3 gmp gnu-sed gettext libsodium
$ ln -s /usr/local/Cellar/gettext/0.20.1/bin/xgettext /usr/local/opt
$ export PATH="/usr/local/opt:$PATH"
```

If you need SQLite:

```sh
$ brew install sqlite
$ export LDFLAGS="-L/usr/local/opt/sqlite/lib"
$ export CPPFLAGS="-I/usr/local/opt/sqlite/include"
```

If you need Python 3.x for mako:

```sh
$ brew install pyenv
$ echo -e 'if command -v pyenv 1>/dev/null 2>&1; then\n  eval "$(pyenv init -)"\nfi' >> ~/.bash_profile
$ source ~/.bash_profile
$ pyenv install 3.7.4
$ pip install --upgrade pip
```

If you don't have bitcoind installed locally you'll need to install that as well:

```sh
$ brew install berkeley-db4 boost miniupnpc pkg-config libevent
$ git clone https://github.com/bitcoin/bitcoin
$ cd bitcoin
$ ./autogen.sh
$ ./configure
$ make src/bitcoind src/bitcoin-cli && make install
```

Clone lightning:

```sh
$ git clone https://github.com/ElementsProject/lightning.git
$ cd lightning
```

Configure Python 3.x & get mako:

```sh
$ pyenv local 3.7.4
$ pip install mako
```

Build lightning:

```sh
$ ./configure
$ make
```

## Setup Nodes

Make sure bitcoind is running using `bitcoin.conf` given in `.regtest` repository

### c-lightning

Start c-lightning daemons (note the port defined by `--addr`):

```sh
$ ./lightning/lightningd/lightningd --lightning-dir=<dazaar-dir>/.c1 --bitcoin-rpcuser=lnd --bitcoin-rpcpassword=password --network=regtest --log-level=debug --daemon --addr=localhost:9733
$ ./lightning/lightningd/lightningd --lightning-dir=<dazaar-dir>/.c2 --bitcoin-rpcuser=lnd --bitcoin-rpcpassword=password --network=regtest --log-level=debug --daemon --addr=localhost:9732
```

Set alias for c-lightning cli:

```sh
$ alias c1-cli="<c-lightning-dir>/lightning/cli/lightning-cli --lightning-dir=<dazaar-dir>/.c1 --network=regtest"
$ alias c2-cli="<c-lightning-dir>/lightning/cli/lightning-cli --lightning-dir=<dazaar-dir>/.c2 --network=regtest"
```

Check that node1 has no pre-existing peers

```sh
$ c1-cli listpeers
```

Create a receiveing address for each node:

```sh
$ c1-cli newaddr
$ c2-cli newaddr
```

Connect to the nodes to eachother:

```sh
$ c2-cli getinfo | grep id # copy pubkey to <node2_id>, host and port were defined when the daemon was initiated
$ c1-cli connect <node2_id> localhost 9732
```

Send funds to each node

```sh
$ bitcoin-cli --rpcpassword=password --rpcuser=lnd --regtest sendtoaddress <node1_receive_addr> 100
$ bitcoin-cli --rpcpassword=password --rpcuser=lnd --regtest sendtoaddress <node2_receive_addr> 100
```

Set up a channel with 500,000 sats

```sh
$ c1-cli fundchannel <node2_id> 500000
```

Confirm funding transaction by repeating:

```sh
$ bitcoin-cli --rpcpassword=password --rpcuser=lnd --regtest generatetoaddress 20 <node2_receive_addr
```

Check for that both nodes see the channel:

```sh
$ c1-cli listchannels
$ c2-cli listchannels
```

### LND

In new terrminal windows, start the LND daemons:

```sh
$ lnd --lnddir=.lnd1
$ lnd --lnddir=.lnd2
```

Optional - Set alias for lncli command:

```sh
$ alias lncli1="lncli --lnddir=.lnd1 --network=regtest --rpcserver=localhost:12009"
$ alias lncli2="lncli --lnddir=.lnd2 --network=regtest --rpcserver=localhost:13009"
```

Create/unlock wallets:

```sh
$ lncli1 create
$ lncli2 create
```

Check that node1 has no pre-existing peers

```sh
$ lncli1 listpeers
```

	- If they do, run `lncli1 listchannels`
	- The nodes may already have a prexisting channel in which case skip the following steps

Connect the nodes to eachother:
```sh
$ lncli1 getinfo | grep identity_pubkey # copy pubkey to <node1_id>, host and port may be found in lnd.conf
$ lncli2 connect <node1_id>@<host>:<port>
```

Create a receiveing address for each node:
```

```sh
$ lncli1 newaddr
$ lncli2 newaddr
```

Send funds to each node

```sh
$ bitcoin-cli --rpcpassword=password --rpcuser=lnd --regtest sendtoaddress <node1_receive_addr> 100
$ bitcoin-cli --rpcpassword=password --rpcuser=lnd --regtest sendtoaddress <node2_receive_addr> 100
```

Set up a channel with 500,000 sats

```sh
$ lncli1 openchannel <node2_id> 500000
```

Confirm funding transaction by repeating:

```sh
$ bitcoin-cli --rpcpassword=password --rpcuser=lnd --regtest generatetoaddress 10 <node2_receive_addr
```

Check that both nodes see the channel:

```sh
$ lncli1 listchannels
$ lncli2 listchannels
```

## Testing

We now have 2 or more nodes setup with channels open to eachother and are ready to test out dazaar payments!
