const { Client, MessageMedia } = require('whatsapp-web.js');
const express = require('express');
const { body, validationResult } = require('express-validator');
const socketIO = require('socket.io');
const qrcode = require('qrcode');
const http = require('http');
const fs = require('fs');
const { phoneNumberFormatter } = require('./helpers/formatter');
const fileUpload = require('express-fileupload');
const axios = require('axios');
const mime = require('mime-types');

const port = process.env.PORT || 8000;

const app = express();
const server = http.createServer(app);
const io = socketIO(server);

app.use(express.json());
app.use(express.urlencoded({
  extended: true
}));
app.use(fileUpload({
  debug: true
}));

const SESSION_FILE_PATH = './whatsapp-session.json';
let sessionCfg;
if (fs.existsSync(SESSION_FILE_PATH)) {
  sessionCfg = require(SESSION_FILE_PATH);
}

app.get('/', (req, res) => {
  res.sendFile('index.html', {
    root: __dirname
  });
});
//__________________________________________
const client = new Client({
  restartOnAuthFail: true,
  puppeteer: {
    headless: true,
    args: [
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--disable-dev-shm-usage',
      '--disable-accelerated-2d-canvas',
      '--no-first-run',
      '--no-zygote',
      '--single-process', // <- this one doesn't works in Windows
      '--disable-gpu'
    ],
  },
  session: sessionCfg
});
//__________________________________________
// Socket IO
io.on('connection', function(socket) {
  socket.emit('message', 'Connecting...');

  client.on('qr', (qr) => {
    console.log('QR RECEIVED', qr);
    qrcode.toDataURL(qr, (err, url) => {
      socket.emit('qr', url);
      socket.emit('message', 'QR Code received, scan please!');
    });
  });

  client.on('ready', () => {
    socket.emit('ready', 'Whatsapp is ready!');
    socket.emit('message', 'Whatsapp is ready!');
  });

  client.on('authenticated', (session) => {
    socket.emit('authenticated', 'Whatsapp is authenticated!');
    socket.emit('message', 'Whatsapp is authenticated!');
    console.log('AUTHENTICATED', session);
    sessionCfg = session;
    fs.writeFile(SESSION_FILE_PATH, JSON.stringify(session), function(err) {
      if (err) {
        console.error(err);
      }
    });
  });

  client.on('auth_failure', function(session) {
    socket.emit('message', 'Auth failure, restarting...');
  });

  client.on('disconnected', (reason) => {
    socket.emit('message', 'Whatsapp is disconnected!');
    fs.unlinkSync(SESSION_FILE_PATH, function(err) {
        if(err) return console.log(err);
        console.log('Session file deleted!');
    });
    client.destroy();
    client.initialize();
  });
});
server.listen(port, function() {
  console.log('App running on *: ' + port);
});

//___________________________________________
// MY INFO
const my_info =
    "\nAs you had asked for the contact details," +
    " you can reach out at https://github.com/Kunalvrm555 \n" +
    "see ya! 😇"
const kunal = '919354817605@c.us' //my contact id

// ___________________________________________________________________________________________
//FUNCTIONS
function check_Admin(message, chat) {
    const authorId = message.author || message.from;
    if (authorId === kunal) {
        console.log("OVERRIDE")
        return true
    }
    let isAdmin = 1;
    for (let participant of chat.participants) {
        if (participant.id._serialized === authorId && !participant.isAdmin) {
            message.reply("This command can only be used by group admins.");
            isAdmin = 0;
            break;
        }
    }
    return isAdmin;
}

//___________________________________________________________________________________________//

client.on("group_join", async (notification) => {

    const chat_id = notification.chatId;
    const ids = notification.recipientIds;
    for (let id of ids) {
        const cnt = await client.getContactById(id);
        if (cnt.isMe) {
            console.log('Added to new Group');
            const msg =
                "Hello everyone" +
                "\nMy name is Vaishnavi.\n" +
                "I am a chatbot under development for private and group chats.\n" +
                "send *!help* to see what I can do."
            client.sendMessage(chat_id, msg);
        }
    }
});

async function fun(message, chat) {
    if (chat.isGroup) { //IF MESSAGE IS RECEIVED IN A GROUP CHAT

        //when BOT is mentioned
        const mentions = await message.getMentions();
        for (let cont of mentions) {
            if (cont.isMe) {
                const contact = await message.getContact();

                await chat.sendMessage(`Hello @${contact.id.user}`, {
                    mentions: [contact]
                });
            }
        }

        // !(command) features (GROUP)

        if (message.body === '!help') {
            const contact = await message.getContact();
            const msg = "\nHere is the list of commands that you can use.\n\n" +
                "*!everyone*\nmention everyone in the group (only admins).\n\n" +
                "*!call @person*\nask me to call out a person in the group and say something nice 😉 to them\n\n" +
                "*!delete*\ntag a message that I've sent to delete the message for everyone (only admins).\n\n" +
                "*!sticker*\nreceive a random sticker from my collection 😁\n\n" +
                "*!makesticker*\ntag any image and send this command to get the image as sticker 🤩\n\n " +
                "*!leave*\nask me to leave the group 🥺 (only admins)\n\n" +
                "*!info*\nobtain additional information"
            message.reply(`Hey ${contact.pushname} !` + msg);

        }
        else if (message.body === '!everyone') {

            if (check_Admin(message, chat)) {
                let text = "";
                let mentions = [];

                for (let participant of chat.participants) {
                    const contact = await client.getContactById(participant.id._serialized);

                    mentions.push(contact);
                    text += `@${participant.id.user} `;
                }

                await chat.sendMessage(text, { mentions });
            }
        }
        else if (message.body.startsWith('!say')) {
            if (message.body.includes(' to ')) {
                console.log("YES")
                const msg = message.body.split('"');
                const person = message.body.split(' to ')
                console.log(person[1])
                for (let participant of chat.participants) {
                    try {
                        const contact = await client.getContactById(participant.id._serialized);
                        if (contact === undefined) { continue }
                        else if (!contact.isMe && contact.pushname.startsWith(person[1])) {
                            console.log("MATCH -- " + contact.pushname)
                            console.log("message <encrypted>");

                            await chat.sendMessage(`@${contact.id.user} ` + msg[1], {
                                mentions: [contact]
                            });


                        }
                        else {
                            console.log("NO MATCH --   " + contact.pushname)
                        }
                    }
                    catch (error) {
                        console.log("ERROR IN SENDING CUSTOM MESSAGE")
                    }
                }

            }

        }


        else if (message.body.startsWith('!call')) {

            const bad_word = ["FOOL", "STUPID", "IDIOT"];

            for (let cont of mentions) {
                if (!cont.isMe) {
                    var random_bad_word = bad_word[(Math.random() * bad_word.length) | 0]
                    await chat.sendMessage(`@${cont.id.user} ` + random_bad_word, {
                        mentions: [cont]
                    });
                }
            }
        }
        else if (message.body === '!delete') {
            if (message.hasQuotedMsg) {
                if (check_Admin(message, chat)) {
                    const quotedMsg = await message.getQuotedMessage();
                    if (quotedMsg.fromMe) {
                        quotedMsg.delete(true);
                    } else {
                        message.reply('I can only delete my own messages')
                    }
                }
            }
            else {
                message.reply("Please tag a message you wish to delete")
            }
        }
        else if (message.body === `!makesticker`) {
            if (message.hasQuotedMsg) {

                const quotedmsg = await message.getQuotedMessage();

                if (quotedmsg.type === MessageTypes.IMAGE) {
                    if (quotedmsg.hasMedia) {
                        message.reply("Alright 😇😇\nJust give me a second")
                        try {

                            const img = await quotedmsg.downloadMedia()
                            chat.sendMessage(img, { sendMediaAsSticker: true })
                        }
                        catch (error) {
                            message.reply("Sorry, I couldn't access the image. Please resend it.")
                            console.log("IMAGE to STICKER conversion error")
                            socket.emit("IMAGE to STICKER conversion error")
                            // console.log(error)
                        }

                    }
                    else {
                        message.reply("The tagged message doesn't contain valid media")
                    }
                }
                else {
                    message.reply("I think you've tagged the wrong message 😅\nIt doesn't have any image.")
                }
            }

            else {
                message.reply("Please tag an image with this command to make a sticker")
            }

        }
        else if (message.body === '!sticker') {
            var fs = require('fs');
            var files = fs.readdirSync('./stickers')
            let filename = files[Math.floor(Math.random() * files.length)]
            const stickerMedia = MessageMedia.fromFilePath('./stickers/' + filename);
            chat.sendMessage(stickerMedia, { sendMediaAsSticker: true });

        }

        // else if (message.body.startsWith('!sendto ')) {
        //     // Direct send a new message to specific id
        //     let number = message.body.split(' ')[1];
        //     let messageIndex = message.body.indexOf(number) + number.length;
        //     let mesg = message.body.slice(messageIndex, message.body.length);
        //     number = number.includes('@c.us') ? number : `${number}@c.us`;
        //     chat.sendSeen();
        //     client.sendMessage(number, mesg);
        // }
        else if (message.body === '!info') {
            message.reply("I am a chatbot developed by ```Kunal Verma ```😇😇\n" +
                "to get contact details, send *!kunal* ");
        }
        else if (message.body === '!kunal') {
            const contact = await message.getContact()
            const chat = await contact.getChat()
            chat.sendMessage(`Hey ${contact.pushname}` + my_info)
            message.reply("I have sent the details to your inbox 😇 \nPlease check")
        }
        else if (message.body === '!leave') {
            if (check_Admin(message, chat)) {
                await chat.leave();
            }
        }


        else if (message.body.startsWith('! ')) {
            message.reply('Please enter a command keyword after a *!* without leaving a blank space');
        }
        else if (message.body.startsWith('!')) {
            message.reply('This function is not available.Send a *!help* to get the list of commands.');
        }
    }
    else {  //PRIVATE CHAT


        /* if (message.type === MessageTypes.IMAGE) {
            console.log('IMAGE RECEIVED');
        } 
        */
        const contact = await message.getContact();

        const messages = await chat.fetchMessages({ limit: 2 });

        let _links = message.links
        if (messages.length == 1) {
            console.log("first time");
            const msg_ =
                "\nMy name is Vaishnavi.\n" +
                "I am a chatbot under development for private and group chats.\n" +
                "send *help* to see what I can do."
            message.reply(`Hi ${contact.pushname}` + msg_)
        }

        if (_links.length) {
            // console.log(link[1])
            let invite = _links[0].link
            // console.log(typeof(str))
            // console.log(str.link)
            if (invite.includes('chat.whatsapp.com')) {
                console.log("GROUP INVITE RECEIVED")
            }
            // console.log(invite)


            try {
                invite = invite.replace('https://chat.whatsapp.com/', '');

                await client.acceptInvite(invite);
                message.reply('Joined the group!');
            } catch (e) {
                message.reply('That invite code seems to be invalid.');
            }
        }

        else if (message.body === "hello") {
            chat.sendMessage(`hey, what's up ${contact.pushname}?`);
        }
        else if (message.body === 'hi') {
            chat.sendMessage(`hello ${contact.pushname} `)
        }
        else if (message.body === "how are you") {
            chat.sendMessage(`I'm good ${contact.pushname}, wbu ?`);
        }
        else if (message.body === "what's up") {
            chat.sendMessage(`nothing much ${contact.pushname}, you say`);
        }
        else if (message.body === "help") {
            const msg =
                "\nthe help feature is not available . It will be rolled out soon\n" +
                "send *sticker* to get a random sticker from my collection or add me on a group to explore other features."
            chat.sendMessage(`Hi ${contact.pushname}` + msg)
        }
        /* 
        else if (message.body === `convert to sticker`) {
            if (message.hasQuotedMsg) {
                const quotedmsg = await message.getQuotedMessage();
                if (quotedmsg.type === MessageTypes.IMAGE) {
                    message.reply("OK 😇😇")
                    if (quotedmsg.hasMedia) {
                        const img = await quotedmsg.downloadMedia()
                        quotedmsg.reply("converting this image")
                        chat.sendMessage(img, { sendMediaAsSticker: true })
    
                    }
                }
            }
        } */

        else if (message.body === `sticker`) {
            var fs = require('fs');
            var files = fs.readdirSync('./stickers')
            let filename = files[Math.floor(Math.random() * files.length)]
            const stickerMedia = MessageMedia.fromFilePath('./stickers/' + filename);
            chat.sendMessage(stickerMedia, { sendMediaAsSticker: true });
        }
    }
    // else {}

}

client.on('ready', async () => { //read previously unread messages and respond
    const chats = await client.getChats();
    for (let chat of chats) {
        if (chat.unreadCount) {
            const messages = await chat.fetchMessages({ limit: chat.unreadCount })
            for (let message of messages) {
                fun(message, chat)

            }
            await chat.sendSeen()
            // await chat.sendMessage("Sorry I was offline, took me a while to respond. 😅 ")
        }

    }

});


client.on('message', async (message) => {   //a new message is received 
    const chat = await message.getChat();   //obtain chat details in which message is received
    fun(message, chat)
});

client.initialize();



