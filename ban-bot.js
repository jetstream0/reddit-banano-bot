'use strict';

const snoowrap = require('snoowrap');
const util = require('util');
const BigNumber = require("bignumber.js");
const nanocurrency = require("nanocurrency");
const axios = require('axios');
const fs = require("fs");

// CONFIG
//const TIP_AMOUNT = new BigNumber("13370000000000000000000000000");
const TIP_AMOUNT = new BigNumber("<TIP_AMOUNT>"); //amount you are giving to each user example: "1000000000000000000000000000" = 0.01 ban
const REDDIT_THREAD_ID = "<SUBREDDIT_ID_NUMBER>"; //subreddit id example: supnge 

const NANO_PRIVATE_KEY = "<YOUR_PRIVATE_KEY>"; // private key of the account you are sending from that is generated from your seed(NOT YOUR SEED VALUE)
const NANO_PUBLIC_ADDRESS = "<YOUR_BANANO_PUBLIC_ADDRESS>"; //ban_ address of the account you are sending from example: ban_1gmrfwt6bxaxe7kbrf5kmoqayxcqpgxnea799qp5zh4u45sj4z3ztdugrudm

const BANANODE = "<BANANODE_URL>" //The url of the bananode that you will be sending calls to (I DO NOT RECOMMEND PUBLIC BANANODES AS THEY ARE UNRELIABLE FOR SOME FUNCTIONS)
const BANANO_REPRESENTATIVE = "<YOUR_BANANO_REPRESENTATIVE>" //The public ban_ address of the representative of the account giving away banano. example: ban_1bananobh5rat99qfgt1ptpieie5swmoth87thi74qgbfrij7dcgjiij94xr
//const NANO_NODE_AUTH_HEADER = { headers: { Authorization: "x" } };

//reddit api information. THIS INFORMATION IS OBTAINED THROUGH REDDIT API
const REDDIT_USER_AGENT = '<NAME_OF_REDDIT_AGENT>' //
const REDDIT_CLIENT = '<CLIENT_ID>' //CLIENT ID OF THE REDDIT AGENT
const REDDIT_sECRET = '<SECRET_KEY>', //SECRET KEY OF REDDIT AGENT
const REDDIT_USERNAME = '<USERNAME_OF_REDDIT_AGENT_MAKER>' //USERNAME OF WHOMEVER MADE THE REDDIT AGENT
const REDDIT_PASSWORD = '<PASSWORD_OF_REDDIT_AGENT_MAKER>' //PASSWORD OF WHOMEVER MADE THE REDDIT AGENT


// UTIL FUNCTIONS
const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));
const validateAddress = (addy) => /^(?:ban)(?:_)(?:1|3)(?:[13456789abcdefghijkmnopqrstuwxyz]{59})$/.test(addy) //&& nanocurrency.checkAddress(addy);
let PROCESSED_USERS = new Set(JSON.parse(fs.readFileSync("./paid_users.json", "utf8")));
let PROCESSED_ADDRESSES = new Set(JSON.parse(fs.readFileSync("./paid_addresses.json", "utf8")));

let ACCOUNT_INFO = {
	FRONTIER: "",
	CURRENT_BALANCE: 0
};

async function rpc(body) {
	//return (await axios.post('https://node.shrynode.me/api', body, NANO_NODE_AUTH_HEADER)).data;
    
    return (await axios.post('https://kaliumapi.appditto.com/api', body)).data;
}

function toRaw(bigNum) {
	return bigNum.toString(10);
}

async function sendTip(destination) {
	console.log("Sending tip to", destination);
    
    const work_response = await axios.post(BANANODE, {
        action: "work_generate",
        hash: ACCOUNT_INFO.FRONTIER
        })
    
    //console.log("work_response: " + JSON.stringify(work_response.data));
	// const work_response = await axios.post("https://bpow.banano.cc/service/", {
	// 	hash: ACCOUNT_INFO.FRONTIER,
	// 	user: "x",
	// 	api_key: "x",
	// 	difficulty: "fffffff800000000" // change this to difficulty that banano uses
	// });

	const work = work_response.data.work;
	const AFTER_BALANCE = ACCOUNT_INFO.CURRENT_BALANCE.minus(TIP_AMOUNT);

	const block_json = {
	 	balance: toRaw(AFTER_BALANCE),
	 	link: destination,
	 	previous: ACCOUNT_INFO.FRONTIER,
	 	representative: BANANO_REPRESENTATIVE, // banano rat pie
	 	work: work
	 };

    //console.log("AFTER_BALANCE: " + toRaw(AFTER_BALANCE));
	//const block = nanocurrency.createBlock(NANO_PRIVATE_KEY, block_json);
     const block_data = await axios.post(BANANODE, {
        action: "block_create",
        json_block: true,
        type: "state",
        balance: toRaw(AFTER_BALANCE),
        key: NANO_PRIVATE_KEY,
        representative: BANANO_REPRESENTATIVE,
        link: destination,
        previous: ACCOUNT_INFO.FRONTIER
      })

    //console.log("block: " + JSON.stringify(block_data.data));
	ACCOUNT_INFO.FRONTIER = block_data.data.hash;
    console.log("new block data hash: " + block_data.data.hash)
	const publish_resp = await axios.post("https://kaliumapi.appditto.com/api", {
		"action": "process",
		"json_block": "true",
		"subtype": "send",
		"block": block_data.data.block
	});

    //console.log(publish_resp.data)
	ACCOUNT_INFO.CURRENT_BALANCE = new BigNumber(block_data.data.block.balance);
	console.log("New balance: " + toRaw(ACCOUNT_INFO.CURRENT_BALANCE))
    if ("error" in publish_resp) {
        console.error("Something wrong happened sending nano", publish_resp);
        process.exit(1);
    }

	console.log("[SEND SUCCESS] RPC Response:", publish_resp.data, "BALANCE LEFT:", toRaw(ACCOUNT_INFO.CURRENT_BALANCE));
}

function saveData() {
	fs.writeFileSync("./paid_users.json", JSON.stringify(Array.from(PROCESSED_USERS)));
	fs.writeFileSync("./paid_addresses.json", JSON.stringify(Array.from(PROCESSED_ADDRESSES)));
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

	if (PROCESSED_ADDRESSES.has(found_address)) {
		return null;
	}

	if (PROCESSED_USERS.has(comment.author.name)) {
		return null;
	}

	// lt 0.1 NANO
	if (ACCOUNT_INFO.CURRENT_BALANCE.lte("100000000000000000000000000000")) {
		console.log("<0.1 NANO left in the account, quitting.");

		process.exit();
	}
    console.log("Found address: " + found_address);
	return found_address;
}

async function setup() {
	const response = (await axios.post('https://kaliumapi.appditto.com/api', { action: "account_info", account: NANO_PUBLIC_ADDRESS })).data;

	ACCOUNT_INFO.FRONTIER = response.frontier;
	ACCOUNT_INFO.CURRENT_BALANCE = new BigNumber(response.balance);

    console.log(ACCOUNT_INFO);
	console.log("ACCOUNT_INFO.FRONTIER", ACCOUNT_INFO.FRONTIER);
	console.log("ACCOUNT_INFO.BALANCE", toRaw(ACCOUNT_INFO.CURRENT_BALANCE));
}

async function pocket(hash, amount) {
    const work_response = await axios.post("https://bpow.banano.cc/service/", {
		hash: ACCOUNT_INFO.FRONTIER,
		user: "x",
		api_key: "x",
		difficulty: "fffffff800000000" // change this to difficulty that banano uses
	});

	const AFTER_BALANCE = ACCOUNT_INFO.CURRENT_BALANCE.plus(amount);

	const block_json = {
		balance: toRaw(AFTER_BALANCE),
		link: hash,
		previous: ACCOUNT_INFO.FRONTIER,
		representative: BANANO_REPRESENTATIVE, // shrynode
		work: work_response.data.work
	};

	//const block = nanocurrency.createBlock(NANO_PRIVATE_KEY, block_json);
    
	ACCOUNT_INFO.FRONTIER = block.hash;

	const publish_resp = await rpc({
		"action": "process",
		"json_block": "true",
		"subtype": "receive",
		"block": block.block
	});

	if ("error" in publish_resp) {
		console.log("error pocketing funds:", publish_resp);
        process.exit(1);
	}

	ACCOUNT_INFO.CURRENT_BALANCE = new BigNumber(block.block.balance);
}

async function checkReceivableNano () {
    console.log("Checking pending nano...");
    const pending = await rpc({ action: "pending", account: NANO_PUBLIC_ADDRESS, count: 20, threshold: "100000000000000000000000000000" });

    for (let i = 0; i < Object.keys(pending.blocks).length; i++) {
        const hash = Object.keys(pending.blocks)[i];
        const amount = Object.values(pending.blocks)[i];

        console.log("Receiving block:", hash, amount);
        await pocket(hash, amount);
    }
}

const ACCOUNT = new snoowrap({
	userAgent: REDDIT_USER_AGENT,
	clientId: REDDIT_CLIENT,
	clientSecret: REDDIT_sECRET,
	username: REDDIT_USERNAME,
	password: REDDIT_PASSWORD
});

async function main() {
	await setup();

	while (true) {
		try {
            //await checkReceivableNano();

			console.log("Fetching thread...");

			const thread = await ACCOUNT.getSubmission(REDDIT_THREAD_ID).expandReplies({ depth: 0 })

			const start_date = Date.now();

			console.log("Fetching ALL comments!");
			const comments = await thread.comments.fetchAll({ skipReplies: true });

			console.log("Took", Date.now() - start_date, "ms");
			console.log("Found", comments.length, "comments");

			for (let i = 0; i < comments.length; i++) {
				try {
					const nano_address = await checkComment(comments[i]);

					if (nano_address !== null) {
						console.log("Sending nano to comment:", comments[i].id, "User:", comments[i].author.name, "Address:", nano_address);

						PROCESSED_ADDRESSES.add(nano_address);
						PROCESSED_USERS.add(comments[i].author.name);

						await sendTip(nano_address);
					}
				} catch (e) {
					console.log("SOMETHING EXTREMELY BAD HAPPENED PLEASE FIX: ", e);
				}
			}
			console.log("Completed comment section. Saving previously awarded users/addresses ....")
			saveData();
			console.log(".... previously awarded users/addresses saved successfully.")
			console.log("Waiting 5s seconds before fetching again...");

			await sleep(5000);
		} catch (e) {
			if (e.toString().includes("ratelimit was exceeded")) {
				console.log("Encountered rate limit, waiting 30s...");
				await sleep(30000);
			} else {
				console.log("Something wrong happened, waiting 5s before resuming:", e);
                await sleep(5000);
			}
		}
	}
}

main();