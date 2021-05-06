const http = require("http");
const websocketServer = require("websocket").server;
const httpServer = http.createServer();
httpServer.listen(process.env.PORT || 9090, () => console.log("Server listening..."));

const clients = {};
const games = {};

const wsServer = new websocketServer({
    "httpServer": httpServer
});

wsServer.on("request", request => {
    // connect
    const connection = request.accept(null, request.origin);
    connection.on("open", () => console.log("Opened!"));
    connection.on("close", () => console.log("Closed!"));
    connection.on("message", message => {
        const result = JSON.parse(message.utf8Data);

        // create a new game
        if (result.method === "create") {
            const clientId = result.clientId;
            const gameId = generateRoomId();
            
            games[gameId] = {
                "id": gameId,
                "status": "waiting",
                "ownerId": clientId,
                "clients": [],
                "questions": generateQuestions(2)
            }

            const payLoad = {
                "method": "create",
                "game": games[gameId]
            }

            const con = clients[clientId].connection;
            con.send(JSON.stringify(payLoad));
        }

        // join in a game
        if (result.method === "join") {
            const clientId = result.clientId;
            const nickname = result.nickname;
            const gameId = result.gameId;

            const game = games[gameId];

            if (game === undefined) {
                // this room doesn't exist
                return;
            }

            if (game.clients.length >= 5) {
                // max players reach
                return;
            }

            if (games[gameId].status === "running") {
                // the game is already running
                return;
            }

            game.clients.push({
                "clientId": clientId,
                "nickname": nickname
            });

            if (!games[gameId].state)
                games[gameId].state = {};
            
            let state = games[gameId].state;
            state[clientId] = {
                "errors": 0,
                "currentQuestion": 0,
                "nickname": nickname
            }

            const payLoad = {
                "method": "join",
                "game": game
            }

            //loop through all clients and tell them that people has joined
            game.clients.forEach(c => {
                clients[c.clientId].connection.send(JSON.stringify(payLoad));
            });
        }

        if (result.method === "start") {
            // start the game
            games[result.gameId].status = "running";
            
            updateGameState();
        }

        // a user plays [hit or error]
        if (result.method === "play") {
            const gameId = result.gameId;
            const clientId = result.clientId;
            const isError = result.isError;

            let state = games[gameId].state;
            
            if (isError) state[clientId]["errors"] += 1;
            else {
                state[clientId]["currentQuestion"] += 1;
            }
        }

        if (result.method === "finish") {
            // finish the game
            const gameId = result.gameId;
            games[gameId].status = 'finished';
        }
    });
    
    // generate a new clientId
    const clientId = guid();
    clients[clientId] = {
        "connection":  connection
    }

    const payLoad = {
        "method": "connect",
        "clientId": clientId
    }
    
    //send back the client connect
    connection.send(JSON.stringify(payLoad));
});

function updateGameState() {
    for (const g of Object.keys(games)) {
        const game = games[g];

        const payLoad = {
            "method": "update",
            "gameId": game.id,
            "ownerId": game.ownerId,
            "status": game.status,
            "players": game.clients,
            "state": game.state
        }

        game.clients.forEach(c => {
            clients[c.clientId].connection.send(JSON.stringify(payLoad))
        });
    }

    setTimeout(updateGameState, 500);
}

// create room id
function generateRoomId() {
    let room = roomId();

    while (games[room] !== undefined) {
        room = roomId();
    }

    return room;
}

function roomId() {
    let room = "";

    for (let i = 0; i < 6; i++) {
        let isUpperCase = getRandomInt(0, 2);
        let letter = getRandomInt(65, 91);

        room += String.fromCharCode(letter + 32*isUpperCase);
    }

    return room;
}

function S4() {
    return (((1+Math.random())*0x10000)|0).toString(16).substring(1); 
}

// then to call it, plus stitch in '4' in the third group
const guid = () => (S4() + S4() + "-" + S4() + "-4" + S4().substr(0,3) + "-" + S4() + "-" + S4() + S4() + S4()).toLowerCase();

// game functions
function getRandomInt(min, max) {
    min = Math.ceil(min);
    max = Math.floor(max);
    
    return Math.floor(Math.random() * (max - min)) + min;
}

// generate qnt questions, half of each operation (at default levels)
// level 0 => custom operations
// level 1 => easy [+, -]
// level 2 => medium [*, /]
function generateQuestions( level=1, qnt=10, min=2, max=10, operations=null ) {
    let questions = [];
    let existingQuestions = {};

    if (level === 0) {
        return [];
    } else if (level === 1) {
        let qntQuestions = Math.ceil(qnt/2);
        for (let i = 0; i < qntQuestions; i++) {
            let currentQuestion = getSumQuestion(min, max);
            let customHash = `${currentQuestion.first}${currentQuestion.operation}${currentQuestion.second}`;
            
            while (existingQuestions[customHash] !== undefined) {
                currentQuestion = getSumQuestion(min, max);
                customHash = `${currentQuestion.first}${currentQuestion.operation}${currentQuestion.second}`;
            }

            questions.push(currentQuestion);
            existingQuestions[customHash] = true;
        }

        for (let i = qntQuestions; i < qnt; i++) {
            let currentQuestion = getSubtractionQuestion(min, max);
            let customHash = `${currentQuestion.first}${currentQuestion.operation}${currentQuestion.second}`;

            while (existingQuestions[customHash] !== undefined) {
                currentQuestion = getSubtractionQuestion(min, max);
                customHash = `${currentQuestion.first}${currentQuestion.operation}${currentQuestion.second}`;
            }

            questions.push(currentQuestion);
            existingQuestions[customHash] = true;
        }
    } else if (level === 2) {
        let qntQuestions = Math.ceil(qnt/2);
        for (let i = 0; i < qntQuestions; i++) {
            let currentQuestion = getMultiplicationQuestion(min, max);
            let customHash = `${currentQuestion.first}${currentQuestion.operation}${currentQuestion.second}`;

            while (existingQuestions[customHash] !== undefined) {
                currentQuestion = getMultiplicationQuestion(min, max);
                customHash = `${currentQuestion.first}${currentQuestion.operation}${currentQuestion.second}`;
            }

            questions.push(currentQuestion);
            existingQuestions[customHash] = true;
        }

        for (let i = qntQuestions; i < qnt; i++) {
            let currentQuestion = getDivisionQuestion(min, max);
            let customHash = `${currentQuestion.first}${currentQuestion.operation}${currentQuestion.second}`;

            while (existingQuestions[customHash] !== undefined) {
                currentQuestion = getDivisionQuestion(min, max);
                customHash = `${currentQuestion.first}${currentQuestion.operation}${currentQuestion.second}`;
            }

            questions.push(currentQuestion);
            existingQuestions[customHash] = true;
        }
    } else {
        return [];
    }

    return questions;
}

// question type: { first, second, operation, answer }

function getSumQuestion( min, max ) {
    let first = getRandomInt(min, max);
    let second = getRandomInt(min, max);

    return { first: first, second: second, operation: '+', answer: first+second };
}

function getSubtractionQuestion( min, max ) {
    let first = getRandomInt(min, max);
    let second = getRandomInt(min, max);

    if (first < second) {
        let tmp = first;
        first = second;
        second = tmp;
    }

    return { first: first, second: second, operation: '-', answer: first-second };
}

function getMultiplicationQuestion( min, max ) {
    let first = getRandomInt(min, max);
    let second = getRandomInt(min, max);

    return { first: first, second: second, operation: '*', answer: first*second };
}

function getDivisionQuestion( min, max ) {
    let first = getRandomInt(min, max);
    let second = getRandomInt(min, max);

    return { first: first*second, second: second, operation: '/', answer: first };
}
