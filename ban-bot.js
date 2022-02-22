'use strict';

const snoowrap = require('snoowrap');
const util = require('util');
const mongo = require('./database.js');
const banano = require('./banano.js');

// CONFIG
//const TIP_AMOUNT = new BigNumber("13370000000000000000000000000");
const TIP_AMOUNT = 5; //amount you are giving to each user example: "1000000000000000000000000000" = 0.01 ban
const REDDIT_THREAD_ID = "<SUBREDDIT_ID_NUMBER>"; //subreddit id example: supnge 

//reddit api information. THIS INFORMATION IS OBTAINED THROUGH REDDIT API
const REDDIT_USER_AGENT = '<NAME_OF_REDDIT_AGENT>' //
const REDDIT_CLIENT = '<CLIENT_ID>' //CLIENT ID OF THE REDDIT AGENT
const REDDIT_SECRET = process.env.secret_key; //SECRET KEY OF REDDIT AGENT, in env file
const REDDIT_USERNAME = '<USERNAME_OF_REDDIT_AGENT_MAKER>' //USERNAME OF WHOMEVER MADE THE REDDIT AGENT
const REDDIT_PASSWORD = process.env.reddit_pass; //PASSWORD OF WHOMEVER MADE THE REDDIT AGENT, in env file

// UTIL FUNCTIONS
const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));
const validateAddress = (addy) => /^(?:ban)(?:_)(?:1|3)(?:[13456789abcdefghijkmnopqrstuwxyz]{59})$/.test(addy) //&& nanocurrency.checkAddress(addy);

let db = mongo.getDb();
let collection;
//collection.find({}).forEach(console.dir)
db.then((db) => {collection = db.collection("collection"); 
});

//`user` param can be ban address or reddit username
async function find(user) {
  return await collection.findOne({"user":user});
}

async function insert(user) {
  await collection.insertOne({"user":user});
}

async function sendTip(destination) {
	console.log("Sending tip to", destination);
  let send = banano.send_banano(destination, TIP_AMOUNT);
  if (!send) {
    console.log("Send failed")
  }
}

async function checkComment(comment) {
	console.log("Checking comment ....");
	if (!("body_html" in comment)) return null;
	if (!("author") in comment) return null;
	if (comment.author.name === "[deleted]") return null;
	if (comment.collapsed_reason_code === "DELETED") return null;

	const prefix_index = comment.body_html.indexOf("ban_");
	if (prefix_index == -1) return null;
	const found_address = comment.body_html.substring(prefix_index, prefix_index + 64);
	if (found_address.length !== 64) {
		console.log("Found address but not 64 characters: ", found_address);
		return null;
	}

	if (!validateAddress(found_address)) {
		console.log("Address did not pass regex check or bad address:", found_address);
		return null;
	}

	if (await find(found_address)) {
		return null;
	}

	if (await find(comment.author.name)) {
		return null;
	}

  let faucet_bal = Number(await banano.check_bal());
	if (faucet_bal < 1) {
		console.log("Balance low, quitting.");
		process.exit();
	}
	console.log("Found address: " + found_address);
	return found_address;
}

const ACCOUNT = new snoowrap({
	userAgent: REDDIT_USER_AGENT,
	clientId: REDDIT_CLIENT,
	clientSecret: REDDIT_SECRET,
	username: REDDIT_USERNAME,
	password: REDDIT_PASSWORD
});

async function main() {
  while (true) {
    try {
      console.log('Checking again')
      await banano.receive_deposits();
      //post should be sorted by new comments
      let post = ACCOUNT.getSubmission(REDDIT_THREAD_ID);
      let comments = post.fetch();
      for (let i=0; i < comments.length; i++) {
        try {
          let comment = await checkComment(await comments[i]);
          if (ban_address !== null) {
		  			console.log("Sending banano to comment:", comments[i].id, "User:", comments[i].author.name, "Address:", ban_address);
  
		  			await insert(ban_address);
            await insert(comments[i].author.name);
  
		  			let tx = await sendTip(ban_address);
  
            comments[i].reply(
              `5 Ban has been sent to your [address](https://yellowspyglass.com/hash/`+tx+`)!
              
              Check out r/banano and the [Banano Discord Server](chat.banano.cc).`
            );
		  		}
        } catch (e) {
          console.log(e)
        }
        //ratelimit is 60 per minute (1 per second), but lets give it some buffer
        await sleep(1200);
      }
      //check every five minutes
      await sleep(5*60*1000)
    } catch (e) {
      console.log('Ratelimited exceeded')
      await sleep(61*1000)
    }
  }
}

main();