var TokenManager1 = artifacts.require('TokenManager1');
var Elixir = artifacts.require('Elixir');
var TokenP = artifacts.require('TokenP');
var BigNumber = require('bignumber.js')
BigNumber.config({ROUNDING_MODE: BigNumber.ROUND_FLOOR})
contract('TokenManager1', function(accounts) {
let elixToken;
let tokenManagerInstance;
let tokenPToken;
let devAddress = accounts[7];
let secondDevAddress = accounts[8];
let user1 = accounts[1];
let uploadBlock = 0;
let maxSupply = new BigNumber(30000000000000000000000000);
let devClaimed = 0;
function waitBlocks(numBlocks){
let blockAdvanceArr = []
for( let i = 0; i < numBlocks; i++){
blockAdvanceArr.push(tokenManagerInstance.advanceBlock()); 
}
return Promise.all(blockAdvanceArr);	
}
function fillRandomArray( desiredLength, min, max ){
let randomArray = [];
for( let i = 0; i < desiredLength; i++ ){
randomArray.push( Math.floor(Math.random()*max) + min );
}
return randomArray
}
function rewardFactorToPercentConversion(rewardFactor){
let yearOfBlocks = 86400*365/14;
return Math.floor(yearOfBlocks*100/rewardFactor*1000)/1000;
}
function updateRFForTotalSupply(totalSupply, extraCheck){
totalSupply = totalSupply+devClaimed;
let lenderRewardFactor;
let borrowerRewardFactor;
let totalRewardFactor;
let maxPercent = 10;
let minPercent = 2.5;
let flatteningPoint = 27000000000000000000000000;
let devClaimedAmount = 0;
return tokenPToken.fakeUpdateTotalSupply(totalSupply).then( function (){
return tokenManagerInstance.adjustRewardFactors()	
}).then( function (){
return tokenPToken.devClaimedAmount();
}).then( function (devClaimedAmt){
devClaimedAmount = devClaimedAmt;
return tokenManagerInstance.rewardFactorLender()
}).then( function (lenderRF){
lenderRewardFactor = lenderRF.toNumber();
return tokenManagerInstance.rewardFactorBorrower()
}).then( function (borrowerRF){
borrowerRewardFactor = borrowerRF.toNumber();
totalRewardFactor = borrowerRewardFactor+lenderRewardFactor;
console.log('Total Supply:', Math.floor(totalSupply/(1000000000000000000*1000000)), 'million');
console.log('Percent w/ Hyperbolic Decay:', rewardFactorToPercentConversion(totalRewardFactor));
})
}
before( function (){
return Elixir.deployed().then( function (instance){
elixToken = instance
return TokenManager1.deployed()
}).then( function (instance){
tokenManagerInstance = instance;
return tokenManagerInstance.setFakeElixAddress(elixToken.address);
}).then( function (){
return TokenP.deployed()
}).then( function(instance){
tokenPToken = instance
return tokenPToken.setTkm(tokenManagerInstance.address);
}).then( function (){
return tokenManagerInstance.setNewTokenAddress(tokenPToken.address);
}).then( function (){
return tokenPToken.setFakeDevAddress(devAddress);
}).then( function (){
return tokenPToken.uploadBlock();
}).then( function(uplBlock){
uploadBlock = uplBlock.toNumber()
})
})
it("interest initially starts with 10 percent reward", function (){
let totalSupply = 0
function extraCheck(totalRewardFactor){
assert.equal(rewardFactorToPercentConversion(totalRewardFactor), 10);
}
return updateRFForTotalSupply(totalSupply, extraCheck)
})
it("interest is at 2.5 percent at 18 million total supply", function (){
let totalSupply = 18000000000000000000000000;
function extraCheck(totalRewardFactor){
assert.equal(rewardFactorToPercentConversion(totalRewardFactor), 2.5);
}
return updateRFForTotalSupply(totalSupply, extraCheck)
})
it("interest stays at 2.5 percent after 18 million total supply", function (){
let totalSupply = 18000000000000000000000000;
function extraCheck(totalRewardFactor){
assert.equal(rewardFactorToPercentConversion(totalRewardFactor), 2.5);
}
return updateRFForTotalSupply(totalSupply, extraCheck)
})
it("mining interest is between 10 and 2.5 percent with half of 18 million total supply", function (){
let totalSupply = 18000000000000000000000000/2;
function extraCheck(){
assert.isBelow(rewardFactorToPercentConversion(totalRewardFactor), 10);
assert.isAbove(rewardFactorToPercentConversion(totalRewardFactor), 2.5);
}
return updateRFForTotalSupply(totalSupply, extraCheck)
})
it("mining interest is close to 2.5 percent with almost 18 million total supply", function (){
let totalSupply = 17900000000000000000000000;
function extraCheck(){
assert.isBelow(rewardFactorToPercentConversion(totalRewardFactor), 10);
assert.isAbove(rewardFactorToPercentConversion(totalRewardFactor), 2.5);
}
return updateRFForTotalSupply(totalSupply, extraCheck);
})
it("uses hyperbolic decay for mining interest", function (){
randomTotalSupplys = [0, 300000*1000000000000000000, 1000000*1000000000000000000, 5000000*1000000000000000000, 10000000*1000000000000000000, 15000000*1000000000000000000, 20000000*1000000000000000000, 21000000*1000000000000000000]
function extraCheck(){
assert.isBelow(rewardFactorToPercentConversion(totalRewardFactor), 10);
assert.isAbove(rewardFactorToPercentConversion(totalRewardFactor), 2.5);
}
return randomTotalSupplys.reduce( function (chain, totalSupply){
return chain.then(function (){
return updateRFForTotalSupply(totalSupply, extraCheck);
})
}, Promise.resolve());
})
})