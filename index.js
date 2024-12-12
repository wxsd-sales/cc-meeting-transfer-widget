import express from "express";
import cors from "cors";
import 'dotenv/config';
import fetch from "node-fetch";

import Cache from 'ttl-mem-cache';
const cache = new Cache();

const app = express();
const port = process.env.PORT || 5000;

//needed for CommonJS
import { fileURLToPath } from "url";
import { dirname } from "path";
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const __redirecturi = process.env.HOST_URI + "/auth";

//console.log(__dirname + "/src");
//app.use(cors());
app.use(express.static(__dirname + "/src"));

app.get(`/login`, function(req, res, next){
  console.log("Login token:");
  console.log(req.query.token);
  let prevToken = cache.get(req.query.token);
  if(prevToken){
      console.log("prevToken exists, auth_done.");
      res.redirect(`/auth_done`);
  } else if(req.query.token && req.query.token.length >= 20){
    let redirectUri = `https://webexapis.com/v1/authorize?client_id=${process.env.CLIENT_ID}&response_type=code&`;
    redirectUri += `redirect_uri=${encodeURI(__redirecturi)}&state=${req.query.token}&`;
    redirectUri += `scope=spark%3Acalls_write%20spark%3Akms%20spark%3Apeople_read%20spark%3Acalls_read%20spark%3Axsi`;
    res.redirect(redirectUri);
  } else {
    res.setHeader('Content-Type',"application/json");
    res.statusCode = 400;
    res.send(JSON.stringify({"error":"token parameter invalid or missing."}));
  }
})

app.get('/poll_token', cors(), function(req, res, next){
  let accessToken = null;
  if(req.query.token && req.query.token.length >= 20){
    accessToken = cache.get(req.query.token);
  }
  if(!accessToken){ accessToken = {}}
  res.setHeader('Content-Type',"application/json");
  res.send(JSON.stringify(accessToken));
})

app.get('/auth_done', function(req, res, next){
  res.sendFile(__dirname + "/src/auth_done.html");
})

app.get(`/auth`, async function(req, res, next) {
  console.log(`/auth redirectURI: ${__redirecturi}`);
  let accessTokenResp = await fetch('https://webexapis.com/v1/access_token',{
      method: "POST",
      headers:{
        'Content-Type': 'application/x-www-form-urlencoded'
      },    
      body: new URLSearchParams({
          'grant_type': 'authorization_code',
          'client_id': process.env.CLIENT_ID,
          'client_secret': process.env.CLIENT_SECRET,
          'code': req.query.code,
          'redirect_uri': __redirecturi
      })
  });
  //console.log(accessTokenResp);
  let json = await accessTokenResp.json();
  console.log(`state:${req.query.state}`);
  if(req.query.state && req.query.state.length >= 20){
    cache.set(req.query.state, json, 120*1000);
    console.log("login state added to mem cache.")
  } else {
    console.warn('no login state to add to mem cache.');
  }
  console.log('auth_done');
  res.redirect(`/auth_done`);
});

app.listen(port, () => {
  console.log(`listening on ${port}`);
});
