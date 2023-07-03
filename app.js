const express = require("express");
const path = require("path");
const { open } = require("sqlite");
const sqlite = require("sqlite3");
const bcrypt = require("bcrypt");
const jwt = require("jsonwebtoken");
const dbPath = path.join(__dirname, "twitterClone.db");

const app = express();
app.use(express.json());
let db = null;
const initializeDBAndServer = async () => {
  try {
    db = await open({
      filename: dbPath,
      driver: sqlite.Database,
    });
    app.listen(3000, () => {
      console.log("Server is Running at http://localhost/3000");
    });
  } catch (e) {
    console.log(`DB:Error ${e.message}`);
    process.exit(1);
  }
};
initializeDBAndServer();

const getFollowingPeopleIdsOfUser = async (username) => {
  const getTheFollowingPeopleQuery = `
    SELECT 
    following_user_id FROM follower
    INNER JOIN user ON user.user_id = follower.follower_user_id
    WHERE
    user.username = '${username}';`;
  const followingPeople = await db.all(getTheFollowingPeopleQuery);
  const arrayOfIds = followingPeople.map(
    (eachUser) => eachUser.following_user_id
  );
  return arrayOfIds;
};
//Jwt Token Verification

const authenticateToken = (request, response, next) => {
  const { tweet } = request.body;
  const { tweetId } = request.params;
  let jwtToken;
  const authHeader = request.headers["authorization"];
  if (authHeader !== undefined) {
    jwtToken = authHeader.split(" ")[1];
  }
  if (jwtToken === undefined) {
    response.status(401);
    response.send("Invalid JWT Token");
  } else {
    jwt.verify(jwtToken, "YETFDIDZSHCXZHJ", async (error, payload) => {
      if (error) {
        response.status(401);
        response.send("Invalid JWT Token");
      } else {
        request.payload = payload;
        request.tweetId = tweetId;
        request.tweet = tweet;
        request.userId = payload.userId;
        request.username = payload.username;
        next();
      }
    });
  }
};

const tweetAccessVerification = async (request, response, next) => {
  const { userId } = request;
  const { tweetId } = request.params;
  const getTweetQuery = `
    SELECT * FROM tweet INNER JOIN follower
    ON tweet.user_id = follower.following_user_id
    WHERE tweet.tweet_id = '${tweetId}' AND follower_user_id= '${userId}';`;
  const tweet = await db.get(getTweetQuery);
  if (tweet === undefined) {
    response.status(401);
    response.send("Invalid Request");
  } else {
    next();
  }
};
//Register create user API -1

app.post("/register", async (request, response) => {
  const { username, name, password, gender } = request.body; //Destructuring the data from the API call
  const hashedPassword = await bcrypt.hash(password, 10); //Hashing the given password
  const checkTheUsername = `
SELECT *
FROM user
WHERE username = '${username}';`;
  let userData = await db.get(checkTheUsername); //Getting the user details from the database
  if (userData === undefined) {
    let postNewUserQuery = `
    INSERT INTO
    user (username,name,password,gender)
    VALUES 
    (
        '${username}',
        '${name}',
        '${hashedPassword}',
        '${gender}'
    );`;
    if (password.length < 6) {
      //checking the length of the password
      response.status(400);
      response.send("Password is too short");
    } else {
      let newUserDetails = await db.run(postNewUserQuery); //Updating data to the database
      response.status(200);
      response.send("User created successfully");
    }
  } else {
    /*If the userData is already registered */
    response.status(400);
    response.send("User already exists");
  }
});

//user Login API 2

app.post("/login/", async (request, response) => {
  const { username, password } = request.body;
  const selectUserQuery = `SELECT * FROM user WHERE username = '${username}'`;
  console.log(username, password);
  const dbUser = await db.get(selectUserQuery);
  console.log(dbUser);
  if (dbUser === undefined) {
    response.status(400);
    response.send("Invalid user");
  } else {
    const isPasswordMatched = await bcrypt.compare(password, dbUser.password);
    if (isPasswordMatched === true) {
      const payload = {
        username: username,
      };

      const jwtToken = jwt.sign(dbUser, "YETFDIDZSHCXZHJ");
      response.send({ jwtToken });
    } else {
      response.status(400);
      response.send("Invalid password");
    }
  }
});

//Get latest 4  tweets of user whose user follow API 3

app.get("/user/tweets/feed/", authenticateToken, async (request, response) => {
  const { payload } = request;
  const { user_id, name, username, gender } = payload;
  console.log(username);
  const followingPeopleIds = await getFollowingPeopleIdsOfUser(username);
  const getTweetsFeedQuery = `
    SELECT username,tweet,date_time AS dateTime
    FROM
    user INNER JOIN tweet ON user.user_id = tweet.user_id 
    WHERE 
    user.user_id IN (${followingPeopleIds})
    ORDER BY 
    date_time DESC 
    LIMIT 4;`;
  const tweetFeedArray = await db.all(getTweetsFeedQuery);
  response.send(tweetFeedArray);
});

//API 4
app.get("/user/following/", authenticateToken, async (request, response) => {
  const { payload } = request;
  const { user_id, name, username, gender } = payload;
  console.log(name);

  const getUserFollowerQuery = `
    SELECT name FROM user INNER JOIN follower ON user.user_id = follower.following_user_id
    WHERE 
    follower.follower_user_id = ${user_id};`;
  const userFollowArray = await db.all(getUserFollowerQuery);
  response.send(userFollowArray);
});

//API 5

app.get("/user/followers/", authenticateToken, async (request, response) => {
  const { payload } = request;
  const { user_id, name, username, gender } = payload;
  console.log(name);
  const userFollowerQuery = `
    SELECT DISTINCT name FROM user
    INNER JOIN follower ON user.user_id = follower.follower_user_id
    WHERE follower.following_user_id = ${user_id};`;
  const userFollowersArray = await db.all(userFollowerQuery);
  response.send(userFollowersArray);
});

//API 6

app.get(
  "/tweets/:tweetId",
  authenticateToken,
  tweetAccessVerification,
  async (request, response) => {
    const { username, userId } = request;
    const { tweetId } = request.params;
    const getTweetQuery = `
    SELECT tweet ,
    (SELECT COUNT() FROM like WHERE tweet_id = '${tweetId}') AS likes,
    (SELECT COUNT() FROM reply WHERE tweet_id = '${tweetId}')AS replies,
    date_time AS dateTime
    FROM tweet 
    WHERE tweet.tweet_id = '${tweetId}';`;
    const tweet = await db.get(getTweetQuery);
    response.send(tweet);
  }
);

//API 7
app.get(
  "/tweets/:tweetId/likes/",
  authenticateToken,
  async (request, response) => {
    const { tweetId } = request.params;
    const getLikesQuery = `
    SELECT username FROM user INNER JOIN like ON user.user_id = like.user_id
    WHERE tweet_id = '${tweetId}';`;
    const likedUsers = await db.all(getLikesQuery);
    if (likedUsers.length !== 0) {
      let likes = [];
      const getNamesArray = (likedUsers) => {
        for (let item of likedUsers) {
          likes.push(item.username);
        }
      };
      getNamesArray(likedUsers);
      response.send({ likes });
    } else {
      response.status(401);
      response.send("Invalid Request");
    }
  }
);

//API 8
app.get(
  "/tweets/:tweetId/replies/",
  authenticateToken,
  async (request, response) => {
    const { tweetId } = request.params;
    const getRepliedQuery = `
    SELECT name ,reply FROM user INNER JOIN reply ON user.user_id = reply.user_id
    WHERE tweet_id = ${tweetId};`;
    const repliedUsers = await db.all(getRepliedQuery);
    if (repliedUsers.length !== 0) {
      let replies = [];
      const getNamesArray = (repliedUsers) => {
        for (let item of repliedUsers) {
          let object = {
            name: item.name,
            reply: item.reply,
          };
          replies.push(object);
        }
      };
      getNamesArray(repliedUsers);
      response.send({ replies });
    } else {
      response.status(401);
      response.send("Invalid Request");
    }
  }
);

//API 9
app.get("/user/tweets/", authenticateToken, async (request, response) => {
  const { payload } = request;
  const { user_id, name, username, gender } = payload;
  const getTweetsQuery = `
    SELECT tweet.tweet AS tweet,
    COUNT(DISTINCT like.like_id) AS likes,
    COUNT(DISTINCT reply.reply_id) AS replies,\
    tweet.date_time AS dateTime
    FROM user INNER JOIN tweet ON user.user_id = tweet.user_id INNER JOIN like ON like.tweet_id = tweet.tweet_id INNER JOIN reply ON reply.tweet_id = tweet.tweet_id

    WHERE user.user_id = ${user_id}
    GROUP BY 
    tweet.tweet_id;`;
  const tweetDetails = await db.all(getTweetsQuery);
  response.send(tweetDetails);
});

//API 10
app.post("/user/tweets/", authenticateToken, async (request, response) => {
  const { tweet } = request.body;
  const { payload } = request;
  const { user_id, name, username, gender } = payload;
  const dateTime = new Date().toJSON().substring(0, 19).replace("T", " ");
  const createTweetQuery = `
    INSERT INTO tweet(tweet,user_id,date_time)
    VALUES('${tweet}','${user_id}', '${dateTime}');`;
  await db.run(createTweetQuery);
  response.send("Created a Tweet");
});

//API 11
app.delete("/tweets/:tweetId", authenticateToken, async (request, response) => {
  const { tweetId } = request.params;
  const { payload } = request;
  const { user_id, name, username, gender } = payload;
  const getTheTweetQuery = `
    SELECT * FROM tweet WHERE
    tweet.user_id = ${user_id} AND tweet.tweet_id = ${tweetId};`;
  const tweet = await db.all(getTheTweetQuery);
  if (tweet.length !== 0) {
    const deleteTweetQuery = `
         DELETE  FROM tweet WHERE 
        tweet.user_id =${user_id} AND tweet.tweet_id = ${tweetId};`;
    await db.run(deleteTweetQuery);
    response.send("Tweet Removed");
  } else {
    response.status(401);
    response.send("Invalid Request");
  }
});
module.exports = app;
