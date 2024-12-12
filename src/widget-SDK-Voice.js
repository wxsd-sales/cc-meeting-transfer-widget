import { Desktop } from "@wxcc-desktop/sdk";
//import Calling from '@webex/calling';

const template = document.createElement("template");
var loaded = false;

function customLog(msg, args){
  let logName = "cc-widget-logger:"
  if(args){
    console.log(logName+ msg, args);  
  } else {
    console.log(logName, msg);
  }
}

template.innerHTML = `
  <style>

  .loading-icon {
    width: 30px;
    left: 50%;
    position: relative;
    transform: translateX(-50%);
  }

  .result-span {
    text-align:center;
    display:block;
    min-height: 24px;
  }

  .container{
  }

  .fieldset {
    width: 450px;
    border-radius: 5px;
  }

  .button{
    display: block;
    border-radius: 5px;
    background: #064157;
    color: white;
    padding: 4px;
    margin-top: 10px;
    width: 100%;
    border: none;
    transition:.3s;
  }

  button:disabled,
  button[disabled]{
    border: 1px solid #999999;
    background-color: #cccccc;
    color: #666666;
  }
  
  input{
    border-top: none;
    border-right: none;
    border-left: none;
    border-color: #DDDDDD;
    border-width: 1.5px;
    color: #005E7D
  }

  *:focus {
    outline: none;
  }

  legend {
    color: #064157;
  }

  button:hover:enabled{
    color:#fff;
    background-color:#007AA3;
    cursor: pointer;
  }
 

  </style>

    <div class="container" id="mainContainer">
      <div>
        <fieldset class="fieldset">
          <legend><b>Transfer to Meeting</b></legend>
          <div>
            <img id="loading-icon" src="${process.env.HOST_URI}/img/loading-1.gif" class="loading-icon"/>
            <div id="authorize-content" style="display:none;">
              <button class="button" id="authorize">Authorize</button>
            </div>
            <div id="transfer-content" style="display:none;">
              <input id="manual-sip-radio" type="radio" name="meeting-radio" value="manual-sip">
              <input class="" type="text" id="meetingSIP" onfocus="this.value=''" placeholder="SIP Address"></input><br>
              <div id="meetings-select">
                <p id="no-meetings-label">Searching for Webex Meetings...</p>
              </div>
              <button class="button" id="transferToSIPMeeting">Transfer</button>
            </div>
            <span id="result-span" class="result-span"></span>
          </div>
        </fieldset>
      </div>
    </div>
`;

//Creating a custom logger
const logger = Desktop.logger.createLogger("cc-widget-logger");

let admitNewMemberName;
let lastCheckedMeeting;
var resetTransferTimeout;

function getMeetingName(meeting){
  let name = meeting.meetingInfo.topic;
  if(!name){
      name = meeting.meetingInfo.meetingName;
      if(!name){
        try{
            name = meeting.partner.person.name;
        } catch (e){
            customLog("Could not determine meeting name.");
            name = meeting.sipUri;
        }
    }
  }
  return name;
}

function admitMember(meeting, delta){
  for(let added of delta){
      customLog("admitMember added:");
      customLog(added);
      if(added.status == "IN_LOBBY"){
          customLog("admitMember() - user in lobby.");
          customLog(`admitMember() name - ${added.name}`);
          customLog(`admitMember() admitNewMemberName - ${admitNewMemberName}`);
          if(added.name === admitNewMemberName){
            customLog('admitMember() - admitting this user');
            meeting.admit(added.id).then((res) => {
                customLog('admitMember() - user admitted');
            }).catch((e)=>{
                customLog('admitMember() - error, user not admitted:', e);
            });
          } else {
            customLog('admitMember() added.name does not match expected. Not admitting.');
          }
      }
  }
}

function listenForDemoJoin(meeting){
  customLog(`listening to member changes for meeting:`, meeting);
  meeting.members.on('members:update', (payload) => {
      try{
          customLog("<members:update> payload:", payload);
          customLog("meetingState:", meeting.state);
          if(["JOINED", "ACTIVE", undefined].indexOf(meeting.state) >= 0){
            admitMember(meeting, payload.delta.added);
            admitMember(meeting, payload.delta.updated);
          } else {
            customLog(meeting.state);
            customLog(meeting);
          }
      } catch (e){
          customLog('members.on(members:update) - error:', e);
      }
  });
  customLog("meeting members listener initialized.")
}

function changeAgentState(idleCode){
  if(!idleCode){
    idleCode = "meeting";
  }
  let auxCode;
  for(let code of window.ccDesktop.agentStateInfo.latestData.idleCodes){
    if(code.name.toLowerCase().indexOf(idleCode) >= 0){
      auxCode = code.id;
      customLog(`found meeting auxCode: ${auxCode}`);
    }
  }
  if(auxCode){
    fetch('https://api.wxcc-us1.cisco.com/v1/agents/session/state', {
      method: 'PUT',
      headers: {
         'Authorization': `Bearer ${window.myAgentService.webex.accessToken}`,
         'Content-Type': 'application/json'
      },
      body: JSON.stringify({
                            state: 'Idle', 
                            auxCodeId: auxCode, 
                            lastStateChangeReason: 'Meeting Transfer', 
                            agentId: atob(window.agentDetails.id).split("/").slice(-1)[0]
                          })
    });
  } else {
    customLog("Could not find a meeting auxCode");
  }
}

function radioChange(){
  if (this.checked) {
    lastCheckedMeeting = this.value;
  }
}

class myDesktopSDK extends HTMLElement {
  constructor() {
    super();

    // Google font
    const font = document.createElement("link");
    font.href = "https://fonts.googleapis.com/css2?family=Cutive+Mono&family=Darker+Grotesque:wght@300&family=Poppins:wght@200;400&display=swap";
    font.rel = "stylesheet";
    document.head.appendChild(font);

    const cookieSDK = document.createElement("script");
    cookieSDK.src = "https://cdn.jsdelivr.net/npm/js-cookie@2/src/js.cookie.min.js";
    document.head.appendChild(cookieSDK);

    // Step 1
    this.attachShadow({ mode: "open" });
    this.shadowRoot.appendChild(template.content.cloneNode(true));
    customLog("attached shadow");
    window.shadowRoot = this.shadowRoot;
    this.interactionId = null;

  }

  loadContent(){
    if(!Cookies.get('access_token')){
      this.showAuthorizeDiv();
    } else {
      for(let key of Object.keys(webexService.meetings.meetingCollection.meetings)){
        this.displayMeeting(webexService.meetings.meetingCollection.meetings[key]);
        if(lastCheckedMeeting === key){
          this.shadowRoot.getElementById(key+"-radio").checked = true;
        }
      }
      this.showTransferDiv();
    }
  }

  // Sample function to print latest data of agent
  getAgentInfo() {
    const latestData = Desktop.agentStateInfo.latestData;
    logger.info("myLatestData", latestData);
  }

  // Get form input fields
  inputElement(name) {
    return this.shadowRoot.getElementById(name);
  }


  async init() {
    // Initiating desktop config
    // index.js

      Desktop.config.init();
      try{
        // ************************** Event listeners ************************** \\

        window.shadowRoot = this.shadowRoot;

        this.shadowRoot.getElementById("meetingSIP").addEventListener("click", e => {
          this.shadowRoot.getElementById('manual-sip-radio').checked = true;
          lastCheckedMeeting = 'manual-sip';
        });

        this.shadowRoot.getElementById("manual-sip-radio").addEventListener('change', radioChange);

        // Transfer to SIP Meeting
        this.shadowRoot.getElementById("transferToSIPMeeting").addEventListener("click", e => {
          customLog(this.shadowRoot.getElementById("transferToSIPMeeting"))
          this.shadowRoot.getElementById("transferToSIPMeeting").disabled = true;
          let value = undefined;
          try{
            value = this.inputElement("meetingSIP").value
          }catch(e){
            console.error(e);
          }
          this.transferToSIPMeeting(value);
        });


        this.shadowRoot.getElementById("authorize").addEventListener("click", e => {
          //this.shadowRoot.getElementById("authorize").disabled = true;
          this.showLoadingIcon("Authorizing in new window.");
          let loginUrl = `${process.env.HOST_URI}/login?token=${myAgentService.webex.accessToken}`;
          customLog(`loginUrl:${loginUrl}`);
          const loginWindow = window.open(loginUrl);
          let complete = false;
          const waitForWindowClosed = async () => {
            customLog(loginWindow.closed);
            if (loginWindow.closed) {
              customLog('The login window has been closed.');
              try {
                let response = await fetch(`${process.env.HOST_URI}/poll_token?token=${myAgentService.webex.accessToken}`)
                let json = await response.json();
                customLog(json);
                if(json.access_token){
                  Cookies.set("access_token", json.access_token, { expires: 7 });
                  this.showTransferDiv();
                } else {
                  this.showAuthorizeDiv("Authorization failed. Please try again.", "red");
                }
                complete = true;
                //this.shadowRoot.getElementById("authorize").disabled = false;
              } catch(e){
                customLog(e);
                if(!complete){
                  this.showAuthorizeDiv("Authorization failed. Please try again.", "red");
                }
              }
            } else {
              setTimeout(waitForWindowClosed, 1000);
            }
          };
          waitForWindowClosed()

        });
  
      } catch (e){
        customLog("init Error:", e);
      }
  }

  // Get interactionID, but more info can be obtained from this method
  async getInteractionId() {
    const currentTaskMap = await Desktop.actions.getTaskMap();
    for (const iterator of currentTaskMap) {
      const interId = iterator[1].interactionId;
      return interId;
    }
  }

  async getInteraction() {
    const currentTaskMap = await Desktop.actions.getTaskMap();
    for (const iterator of currentTaskMap) {
      const interId = iterator[1].interaction;
      return interId;
    }
  }


  showLoadingIcon(message, color){
    this.updateResultSpan(message, color);
    this.shadowRoot.getElementById("authorize-content").style.display = "none";
    this.shadowRoot.getElementById("transfer-content").style.display = "none";
    this.shadowRoot.getElementById("loading-icon").style.display = "block";
  }

  showTransferDiv(message, color){
    if(lastCheckedMeeting === "manual-sip"){
      this.shadowRoot.getElementById(lastCheckedMeeting+"-radio").checked = true;
    }
    this.updateResultSpan(message, color);
    this.shadowRoot.getElementById("loading-icon").style.display = "none";
    this.shadowRoot.getElementById("authorize-content").style.display = "none";
    this.shadowRoot.getElementById("transfer-content").style.display = "block";
  }

  showAuthorizeDiv(message, color){
    this.updateResultSpan(message, color);
    this.shadowRoot.getElementById("loading-icon").style.display = "none";
    this.shadowRoot.getElementById("transfer-content").style.display = "none";
    this.shadowRoot.getElementById("authorize-content").style.display = "block";
  }

  updateResultSpan(text, color){
    if(!text){
      text = "";
    } else {
      customLog(`updateResultSpan text:${text}`);
    }
    this.shadowRoot.getElementById("result-span").innerText = text;
    if(!color){
      color = "inherit";
    }
    this.shadowRoot.getElementById("result-span").style.color = color;
  }

  resetTransfer(that){
    customLog("timeout after transfer")
    try{
      customLog(that.shadowRoot.getElementById("transferToSIPMeeting"))
      that.shadowRoot.getElementById("transferToSIPMeeting").disabled = false;
      resetTransferTimeout = setTimeout(function(){
        that.updateResultSpan();
      },5000);
    } catch(e){
      customLog("resetTransfer Failure:");
      customLog(e);
    }
  }

  async transferMeeting(self, sipAddress){
    try{
      //Check if the cookie has expired.
      if(Cookies.get('access_token')){
        const selectedRadioButton = this.shadowRoot.querySelector('input[name="meeting-radio"]:checked');
        if (selectedRadioButton) {
          const selectedValue = selectedRadioButton.value;
          customLog("Selected radio button value:", selectedValue);
          let sipValid = true;
          let meetingName = sipAddress;
          if(selectedValue !== "manual-sip"){
            //Get the sipUri of the selected meeting.
            let meeting = webexService.meetings.meetingCollection.meetings[selectedValue];
            sipAddress = meeting.sipUri;
            meetingName = getMeetingName(meeting);
          } else {
            //If manual Sip Address input is selected
            if(sipAddress.length >= 3 && sipAddress.indexOf("@") > 0 && sipAddress.indexOf("@") < sipAddress.length - 1){
              customLog("sipAddress valid");
            } else {
              sipValid = false;
              this.updateResultSpan(`Manual sip address entered is invalid.`, "red");
            }
          }
          customLog(`sipAddress:${sipAddress}`);
          if(sipValid){
            let interaction = await self.getInteraction();
            customLog('interaction: ', interaction);
            if(interaction){
              let interactionId = await self.getInteractionId();
              if(interactionId){
                let webexUrl = "https://webexapis.com/v1";
                let headers = {
                  'Authorization': `Bearer ${Cookies.get('access_token')}`,
                  'Content-Type': 'application/json'
                }
                let matchedId;
                let remoteNumber = interaction.callAssociatedDetails.ani;
                if(interaction.contactDirection.type === "OUTBOUND"){
                    remoteNumber = interaction.callAssociatedDetails.dn;
                  }
                remoteNumber = remoteNumber.replace("+","");
                customLog(`remoteNumber:${remoteNumber}`);
                //Transfer to ourself using CC SDK (CCSDK cannot xfer to SIP destination)
                let bTResponse = await Desktop.agentContact.blindTransfer({
                  interactionId,
                  data: {
                    destAgentId: window.agentDetails.extension,
                    mediaType: "telephony",
                    destinationType: "DN"
                  }
                });
                customLog("bTResponse:");
                customLog(bTResponse);
                //Look for the call that we just xferred to ourself.
                let callsResponse = await fetch(`${webexUrl}/telephony/calls`, {
                  method: 'GET',
                  headers: headers
                });
                if(callsResponse.status === 401){
                  //Because we check the cookie at the top of the transfer function,
                  //A 401 really shouldn't ever happen, unless a user manually changes their cookie for some reason (unlikely).
                  //However, this is here just in case.
                  this.showAuthorizeDiv("Access denied. Please authorize again.");
                } else {
                  let calls = await callsResponse.json();
                  customLog(calls);
                  for(let call of calls.items){
                    if(call.remoteParty.number.replace("+","") === remoteNumber){
                      if(call.remoteParty.name){
                        admitNewMemberName = call.remoteParty.name;
                      } else {
                        admitNewMemberName = remoteNumber;
                      }
                      matchedId = call.id;
                      customLog(`matched callId: ${call.id}`);
                      break;
                    }
                  }
                  //Divert the call from ourselves to the SIP address of the meeting using WxCalling API (which can xfer to SIP endpoint)
                  let divertResponse = await fetch(`${webexUrl}/telephony/calls/divert`, {
                    method: 'POST',
                    headers: headers, 
                    body: JSON.stringify({
                                          callId: matchedId,
                                          destination: 'rtaylorhansoncoe@coe-sbx.webex.com'
                                        })
                  });
                  customLog(`divertResponse.status:${divertResponse.status}`);
                  if(divertResponse.status >= 200 && divertResponse.status < 300){
                    changeAgentState();
                    this.updateResultSpan(`Transferred ${remoteNumber} to ${meetingName}.`, "green");
                  } else {
                    this.updateResultSpan(`Transfer failed. Status: ${divertResponse.status}`, "red");
                  }
                }
                
              } else {
                this.updateResultSpan("No current interaction.", "red");
              }
            } else {
              this.updateResultSpan("No current interaction.", "red");
            }
          }
        } else {
          this.updateResultSpan(`No meeting selected.`, "red");
        }
      } else {
        this.showAuthorizeDiv();
        this.shadowRoot.getElementById("authorize").click();
      }
    } catch(e){
      customLog("transferMeeting Failure:");
      customLog(e);
      this.updateResultSpan("Transfer to meeting failed.", "red");
    }
    let that = this;
    clearTimeout(resetTransferTimeout);
    setTimeout(function(){
      that.resetTransfer(that)
    }, 1000);
  }

  async transferToMeeting() {
    //AccessToken doesnt have permission to do much with the Webex APIs (/people/me is allowed though)
    customLog("transferToMeeting")
    this.transferMeeting(this);
  }

  // Transfer To SIP Meeting
  async transferToSIPMeeting(meetingSIP) {
    customLog("transferToSIPMeeting")
    customLog(meetingSIP);
    this.transferMeeting(this, meetingSIP);
  }

  displayMeeting(meeting){
    try{
      //Must use window.shadowRoot because this.shadowRoot only works the first load.  
      //Consider changing all instances of this.shadowRoot to window.shadowRoot.
      window.shadowRoot.getElementById("no-meetings-label").style.display = "none";

      let name = getMeetingName(meeting);
  
      const div = document.createElement("div");
      div.id = meeting.id;
  
      const input = document.createElement("input");
      input.id = meeting.id + "-radio";
      input.type = "radio";
      input.name = "meeting-radio";
      input.value = meeting.id;

      input.addEventListener('change', radioChange);
  
      const label = document.createElement("label");
      label.htmlFor = input.id;
      label.innerText = name;
  
      div.appendChild(input);
      div.appendChild(label);
      window.shadowRoot.getElementById("meetings-select").appendChild(div);
      customLog('appended meeting to meetings-select div');
    } catch(e){
      customLog("displayMeeting error:");
      customLog(e);
    }
  }

  removeMeeting(event){
    customLog('meeting:removed event', event);
    try{
      let meetingElement = window.shadowRoot.getElementById(event.meetingId);
      customLog("meetingId", event.meetingId);
      customLog("removing meetingElement:");
      customLog(meetingElement);
      meetingElement.remove();
    } catch(e){
      customLog("removeMeeting error:");
      customLog(e);
    }
  }

  addMeeting(event){
    customLog('meeting:added event', event.meeting);
    this.displayMeeting(event.meeting);
    if (event.meeting.type != "CALL"){
      listenForDemoJoin(event.meeting);
    }
  }

  connectedCallback() {
    try{
      this.init();
      this.getAgentInfo();
      if(!loaded){

        Cookies.get("access_token");

        customLog("myINIT webexService", webexService);
        customLog("myINIT:", Desktop.agentContact)
        //customLog("myINIT accessToken:", Desktop.agentContact.SERVICE.webex.accessToken);
        
        window.myAgentService = Desktop.agentContact.SERVICE;
        window.ccDesktop = Desktop;
        window.lastBroadworksId = null;
        Desktop.agentContact.SERVICE.webex.fetchPersonData("me").then(resp => {
          customLog('Desktop.agentContact.SERVICE.webex.fetchPersonData("me")', resp);
          if(resp.phoneNumbers){
            for (let n of resp.phoneNumbers){
              if(n.type.indexOf("extension") >= 0){
                resp.extension = n.value;
              }
            }
          }
          window.agentDetails = resp;
        });
        
        customLog(`access_token:${Cookies.get('access_token')}`);
        this.loadContent();

        webexService.meetings.register().then(res => {
          customLog("webexService.meetings.register() done!");
          webexService.meetings.on('meeting:added', (event) => {
            this.addMeeting(event);
          });
          webexService.meetings.on('meeting:removed', (event) => {
            this.removeMeeting(event);
          });
          customLog("initialized webexService.meetings.on:meeting:added event listener.");
          webexService.meetings.syncMeetings();
          customLog("Done syncing meetings:", webexService.meetings.meetingCollection.meetings);
        })

        customLog("loaded = true");
        loaded = true;
      } else {
        customLog("webex already loaded.");
        this.loadContent();
      }
    }catch(e){
      customLog('connectedCallback error', e);
      setTimeout( this.connectedCallback, 3000);
    }
  }

  disconnectedCallback() {
    // alert("remove some functions...")
    Desktop.agentContact.removeAllEventListeners();
  }

}

customElements.define("sa-ds-voice-sdk", myDesktopSDK);
