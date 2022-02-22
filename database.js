const mongo = require('mongodb');

//db username
const USERNAME = "";
//part of a connection url eg: @cluster0.4hkct.mongodb.net/db
const CONNECTION = "";

let client = new mongo.MongoClient("mongodb+srv://"+USERNAME+":"+encodeURIComponent(process.env.dbpass)+CONNECTION+"?retryWrites=true&w=majority", { useNewUrlParser: true, useUnifiedTopology: true })

module.exports = {
	getDb: async function() {
		await client.connect();
		return client.db('db');
	},
};