# Automated Tests

Tests using Truffle automated testing framework for crowdfunding, lending and Token P rewards token mining.

Contract files will be included later so that you can run all the tests on your own. Contract files are proprietary at the time of this writing (14 Feb 2018).

### Getting Started

Currently tests will not run without contract files, but once the contracts are publicy released you will be able to run these tests locally with the following steps:


Install testrpc, truffle, and bignumber:

```
npm install -g ethereumjs-testrpc
```

```
npm install -g truffle
```

```
npm install bignumber.js
```


Run testrpc in background:

```
testrpc
```

Compile and Migrate contracts:

```
truffle compile
```

```
truffle migrate
```

Run tests:

```
truffle test
```



### Use Cases

Some tested use cases include iterations of the following:

* Requesting loans from with specified amount and interest
* Accepting or rejecting requested loans
* Making payments to loans and paying them back in full
* Including the option of mining after the loan period and getting the proper reward in Token P (mining reward calculated with hyperbolic decay)
* Flexibility for a 'volatility address' to adjust the amount and interest of the loan to offset the potential volatility of the lent token





