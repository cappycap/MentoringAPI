/*jshint esversion: 8 */
/*
API Dev Server for MentoringApp
To start: node index.js
Localtunnel: lt --port 80* --subdomain mshipapp
* used to be port 3000
*/
var express = require("express");
const fetch = require('node-fetch');
var bodyParser = require("body-parser");
var sql = require("mssql");
var cors = require("cors");
var crypto = require("crypto")
var app = express();
const { Expo } = require("expo-server-sdk");
let expo = new Expo({ accessToken: 'ZVKBleGrwLvwoTIHftrSFjseb9TSpaljblPjMh_q' });
process.env.TZ = 'America/Los_Angeles';

app.use(bodyParser.json());
app.use(cors());

var router = express.Router();

app.use('/api', router);

var config = require('./config.js');

// ------------------------------------- //
//             Notifications             //
// ------------------------------------- //

async function sendMessagesNotification(pushTokens, title, body, sound, data) {
  // Create the messages that you want to send to clients
  let messages = [];
  for (let pushToken of pushTokens) {
    // Each push token looks like ExponentPushToken[xxxxxxxxxxxxxxxxxxxxxx]

    // Check that all your push tokens appear to be valid Expo push tokens
    if (!Expo.isExpoPushToken(pushToken)) {
      console.error(`Push token ${pushToken} is not a valid Expo push token`);
      continue;
    }

    // Construct a message (see https://docs.expo.io/push-notifications/sending-notifications/)
    messages.push({
      to: pushToken,
      sound: sound,
      title: title,
      body: body,
      data: data,
    })
  }
  let chunks = expo.chunkPushNotifications(messages);
  (async () => {
    // Send the chunks to the Expo push notification service. There are
    // different strategies you could use. A simple one is to send one chunk at a
    // time, which nicely spreads the load out over time:
    for (let chunk of chunks) {
      try {
        let ticketChunk = await expo.sendPushNotificationsAsync(chunk);
        console.log(ticketChunk);
        // NOTE: If a ticket contains an error code in ticket.details.error, you
        // must handle it appropriately. The error codes are listed in the Expo
        // documentation:
        // https://docs.expo.io/push-notifications/sending-notifications/#individual-errors
      } catch (error) {
        console.error(error);
      }
    }
  })();

  return true;
}

// ------------------------------------- //
//            Token Securing             //
// ------------------------------------- //

async function authorizeMatch(id, token, callback) {

  sql.connect(config, function (err) {

    if (err) console.log(err);

    console.log(id, token);

    var request = new sql.Request();
    request
    .input('Token', sql.VarChar, token)
    .input('Id', sql.Int, id)
    .query('select * from [User] where Token=@Token and Id=@Id', function (err, set) {

      if (err) console.log(err);
      if (set.recordset.length > 0) {
        callback(true);
      } else {
        callback(false);
      }

    });

  });

}

async function authorizeMatchWrapper(id, token) {
    return new Promise((resolve) => {
        authorizeMatch(id,token,(callback) => {
            resolve(callback);
        });
    });
}

async function authorizeExists(token, callback) {

  sql.connect(config, function (err) {

    if (err) console.log(err);

    var request = new sql.Request();
    request
    .input('Token', sql.VarChar, token)
    .query('select * from [User] where Token=@Token', function (err, set) {

      if (err) console.log(err);
      if (set.recordset.length > 0) {
        callback(true);
      } else {
        callback(false);
      }

    });

  });

}

async function authorizeExistsWrapper(token) {
    return new Promise((resolve) => {
        authorizeExists(token,(callback) => {
            resolve(callback);
        });
    });
}

async function authorizeAdmin(token, callback) {

  sql.connect(config, function (err) {

    if (err) console.log(err);

    var request = new sql.Request();
    request
    .input('Token', sql.VarChar, token)
    .query('select * from [Admin] where Token=@Token', function (err, set) {

      if (err) console.log(err);
      console.log(set);
      if (set.recordset.length > 0) {
        callback(true);
      } else {
        callback(false);
      }

    });

  });

}

async function authorizeAdminWrapper(token) {
    return new Promise((resolve) => {
        authorizeAdmin(token,(callback) => {
            resolve(callback);
        });
    });
}

async function authorizePair(targetId, userId, token, callback) {

  sql.connect(config, function (err) {

    if (err) console.log(err);

    var request = new sql.Request();
    request
    .input('Token', sql.VarChar, token)
    .input('TargetId', sql.Int, targetId)
    .input('UserId', sql.Int, userId)
    .query('select * from [Pair] as P join [User] as U on P.MentorId=U.Id' +
                  ' where MentorId=@UserId and MenteeId=@TargetId and Token=@Token' +
          ' union' +
          ' select * from [Pair] as P join [User] as U on P.MenteeId=U.Id' +
                  ' where MenteeId=@UserId and MentorId=@TargetId and Token=@Token', function (err, set) {

      if (err) console.log(err);
      console.log("Results: ", set);
      if (set.recordset.length > 0) {
        callback(true);
      } else {
        callback(false);
      }
    });
  });
}

// Checks if user has access to information of another user. (are they paired?)
async function authorizePairWrapper(targetId, userId, token) {
    return new Promise((resolve) => {
        authorizePair(targetId,userId,token,(callback) => {
            resolve(callback);
        });
    });
}

// ------------------------------------- //
//             Admin Table               //
// ------------------------------------- //

app.post('/admin/verify-login', async function(req, res) {

  var email = req.body.Email
  var password = req.body.Password
  var token = req.body.Token

  var check = await authorizeExistsWrapper(token); 
  
  if (check) {
    sql.connect(config, function (err) {

      if (err) console.log(err);

      var request = new sql.Request();

      request
      .input('Email', sql.VarChar, email)
      .input('Password', sql.VarChar, password)
      .query('select * from [Admin] where Email=@Email and Password=@Password', function(err, set) {

        if (err) {
          console.log(err)
        } else {
          // Check if this user is valid.
          console.log('login set:',set)
          if (set.recordset.length == 1) {
            res.send({success:true,Admin:set.recordset[0]})
          } else {
            res.send({success:false,errorCode:2})
          }
        }

      })

    })
  } else {

   res.send({success:false,errorCode:1})

  }

});

// ------------------------------------- //
//          Appointment Table            //
// ------------------------------------- //

// GET all Appointments
app.get('/all-appointments/:Token', async function (req, res) {

  var token = req.params.Token;

  var check = await authorizeAdminWrapper(token); if (check) {
    sql.connect(config, function (err) {

      if (err) console.log(err);

      var request = new sql.Request();
      request.query('select * from [Appointment]', function (err, set) {

        if (err) console.log(err);
        res.send(set);

      });

    });
  } else {
    res.send({success:false});
  }

});

// GET Appointment by PairId
app.get('/appointment/upcoming/:PairId/:UserId/:Token', async function(req, res) {

  var pairId = req.params.PairId;
  var token = req.params.Token;
  var userId = req.params.UserId;
  var date = new Date();

  if (pairId == undefined || userId == undefined || token == undefined) {
    res.send({success:false, undefinedValues:true})
  }

  var check = await authorizeMatchWrapper(userId, token); if (check) {
    sql.connect(config, function (err) {

      if (err) console.log(err);

      var request = new sql.Request();

      request.input('input', sql.Int, pairId)
      .input('date', sql.SmallDateTime, date)
      .query('select * from [Appointment] where PairId=@input and ScheduledAt>=@date', function (err, set) {

        if (err) console.log(err);
        res.send(set);

      });

    });
  } else {
    res.send({success:false});
  }

});

app.get('/appointment/past/:PairId/:UserId/:Token', async function(req, res) {

  var pairId = req.params.PairId;
  var userId = req.params.UserId;
  var token = req.params.Token;
  var date = new Date();

  if (pairId == undefined || userId == undefined || token == undefined) {
    res.send({success:false, undefinedValues:true})
  }

  var check = await authorizeMatchWrapper(userId, token); if (check) {
    sql.connect(config, function (err) {

      if (err) console.log(err);

      var request = new sql.Request();

      request.input('input', sql.Int, pairId)
      .input('date', sql.SmallDateTime, date)
      .query('select * from [Appointment] where PairId=@input and ScheduledAt<=@date', function (err, set) {

        if (err) console.log(err);
        res.send(set);

      });

    });
  } else {
    res.send({success:false});
  }

});

app.get('/appointment/:Id/:UserId/:Token', async function(req, res) {

  var id = req.params.Id;
  var userId = req.params.UserId;
  var token = req.params.Token;

  var check = await authorizeMatchWrapper(userId, token); if (check) {
    sql.connect(config, function (err) {

      if (err) console.log(err);

      var request = new sql.Request();

      request.input('input', sql.Int, id)
      .query('select * from [Appointment] where Id=@input', function (err, set) {

        if (err) console.log(err);
        res.send(set);

      });

    });
  } else {
    res.send({success:false});
  }

});

// POST create appointment (provide PairId, ScheduledAt)
app.post('/create-appointment', async function(req, res) {

  var pairId = req.body.PairId;
  var userId = req.body.UserId;
  var token = req.body.Token;
  var scheduledAt = req.body.ScheduledAt;
  var date = new Date();
  var topicId = req.body.TopicId;

  var check = await authorizeMatchWrapper(userId, token); if (check) {
    sql.connect(config, function (err) {

      if (err) console.log(err);

      var pairRequest = new sql.Request();

      pairRequest.input('PairId', sql.Int, pairId)
      .input('Id', sql.Int, userId)
      .query('select MentorId from [Pair] where MenteeId=@Id and Id=@PairId', function (err, set) {

        if (err) console.log(err);
        var mentorId = set.recordset[0].MentorId;

        var mentorRequest = new sql.Request();

        mentorRequest.input('Id', sql.Int, mentorId)
        .query('select ExpoPushToken from [User] where Id=@Id', async function (err, set) {

          if (err) console.log(err);
          var expoPushToken = set.recordset[0].ExpoPushToken;
          var pushTokens = [expoPushToken];
          sendMessagesNotification(pushTokens, 'New Appointment', 'Your mentee proposed a new appointment!', true, {Screen:'MeetingsScreen'})
          var request = new sql.Request();

          request
          .input('PairId', sql.Int, pairId)
          .input('ScheduledAt', sql.SmallDateTime, scheduledAt)
          .input('Status', sql.VarChar(12), 'Pending')
          .input('Created', sql.SmallDateTime, date)
          .input('LastUpdate', sql.SmallDateTime, date)
          .input('TopicId', sql.Int, topicId)
          .query('insert into [Appointment] (PairId, ScheduledAt, Status, Created, LastUpdate, TopicId)'
           + ' values (@PairId, @ScheduledAt, @Status, @Created, @LastUpdate, @TopicId)', async function(err, set) {

             if (err) {
               console.log(err);
             } else {
               if (Expo.isExpoPushToken(expoPushToken))
                 await sendPushNotification(expoPushToken, 'Your mentee has proposed a new meeting!');
             }

             res.send(set);

           });

        });

      });

    });
  } else {
    res.send({success:false});
  }

});

app.post('/update-appointment-status', async function(req, res) {

  var status = req.body.Status;
  var id = req.body.Id;
  var userId = req.body.UserId;
  var token = req.body.Token;

  var check = await authorizeMatchWrapper(userId, token); if (check) {
    sql.connect(config, function (err) {

      if (err) console.log(err);

      var request = new sql.Request();

      request
      .input('Status', sql.VarChar(12), status)
      .input('Id', sql.Int, id)
      .query('update [Appointment] set Status=@Status where Id=@Id', function(err, set) {

        if (err) console.log(err);
        res.send(set);

      });

    });
  } else {
   res.send({success:false});
  }

});

// ------------------------------------- //
//        AppointmentSummary Table       //
// ------------------------------------- //

app.get('/all-summaries/:Token', async function(req, res) {

  var token = req.params.Token;

  var check = await authorizeAdminWrapper(token); if (check) {
    sql.connect(config, function (err) {

      if (err) console.log(err);

      var request = new sql.Request();

      request
      .query('select * from [AppointmentSummary] where PairId in (select Id from Pair where PrivacyAccepted=1)', function (err, set) {

        if (err) console.log(err);
        res.send(set);

      });

    });
  } else {
   res.send({success:false});
  }

});

app.get('/summary/pair/:PairId/:UserId/:Token', async function(req, res) {

  var pairId = req.params.PairId;
  var userId = req.params.UserId;
  var token = req.params.Token;

  var check = await authorizeMatchWrapper(userId, token); if (check) {
    sql.connect(config, function (err) {

      if (err) console.log(err);

      var request = new sql.Request();

      request.input('input', sql.Int, pairId)
      .query('select * from [AppointmentSummary] where PairId=@input', function (err, set) {

        if (err) console.log(err);
        res.send(set);

      });

    });
  } else {
   res.send({success:false});
  }


});

app.get('/summary/user/:UserId/:Token', async function(req, res) {

  var userId = req.params.UserId;
  var token = req.params.Token;

  var check = await authorizeMatchWrapper(userId, token); if (check) {
    sql.connect(config, function (err) {

      if (err) console.log(err);

      var request = new sql.Request();

      request.input('input', sql.Int, userId)
      .query('select * from [AppointmentSummary] where UserId=@input', function (err, set) {

        if (err) console.log(err);
        res.send(set);

      });

    });
  } else {
   res.send({success:false});
  }

});

app.get('/summary/appointment/:AppointmentId/:UserId/:Token', async function(req, res) {

  var appointmentId = req.params.AppointmentId;
  var userId = req.params.UserId;
  var token = req.params.Token;

  var check = await authorizeMatchWrapper(userId, token); if (check) {
    sql.connect(config, function (err) {

      if (err) console.log(err);

      var request = new sql.Request();

      request.input('input', sql.Int, appointmentId)
      .query('select * from [AppointmentSummary] where AppointmentId=@input', function (err, set) {

        if (err) console.log(err);
        res.send(set);

      });

    });
  } else {
   res.send({success:false});
  }

});

app.post('/create-summary', async function(req, res) {

  var appointmentId = req.body.AppointmentId;
  var summaryText = req.body.SummaryText;
  var userId = req.body.UserId;
  var token = req.body.Token;
  var date = new Date();

  var check = await authorizeMatchWrapper(userId, token); if (check) {
    sql.connect(config, function (err) {

      if (err) console.log(err);

      var request = new sql.Request();

      request
      .input('AppointmentId', sql.Int, appointmentId)
      .input('SummaryText', sql.VarChar, summaryText)
      .input('UserId', sql.Int, userId)
      .input('Status', sql.VarChar, "Submitted")
      .input('Created', sql.SmallDateTime, date)
      .input('LastUpdate', sql.SmallDateTime, date)
      .query('insert into [AppointmentSummary] (AppointmentId, SummaryText, UserId, Status, Created, LastUpdate) values (@AppointmentId, @SummaryText, @UserId, @Status, @Created, @LastUpdate)', function(err, set) {

        if (err) console.log(err);
        res.send(set);

      });

    });
  } else {
   res.send({success:false});
  }

});

app.post('/update-summary', async function(req, res) {

  var appointmentId = req.body.AppointmentId;
  var summaryText = req.body.SummaryText;
  var userId = req.body.UserId;
  var token = req.body.Token;
  var date = new Date();

  var check = await authorizeMatchWrapper(userId, token); if (check) {
    sql.connect(config, function (err) {

      if (err) console.log(err);

      var request = new sql.Request();

      request
      .input('AppointmentId', sql.Int, appointmentId)
      .input('SummaryText', sql.VarChar, summaryText)
      .input('UserId', sql.Int, userId)
      .input('Status', sql.VarChar, 'Edited')
      .input('LastUpdate', sql.SmallDateTime, date)
      .query('update [AppointmentSummary] set SummaryText=@SummaryText, LastUpdate=@LastUpdate, Status=@Status where AppointmentId=@AppointmentId and UserId=@UserId', function(err, set) {

        if (err) console.log(err);
        res.send(set);

      });

    });
  } else {
   res.send({success:false});
  }

});

// ------------------------------------- //
//              Pair Table               //
// ------------------------------------- //

app.get('/pair/:UserId/:Token', async function(req, res) {

  var id = req.params.UserId;
  var token = req.params.Token;

  var check = await authorizeMatchWrapper(id, token); if (check) {
    sql.connect(config, function (err) {

      if (err) console.log(err);

      var request = new sql.Request();

      request.input('input', sql.Int, id)
      .query('select * from [Pair] where MentorId=@input or Menteeid=@input', function (err, set) {

        if (err) console.log(err);
        res.send(set);

      });

    });
  } else {
   res.send({success:false});
  }

});

app.get('/pair/both/:MentorId/:MenteeId/:UserId/:Token', async function(req, res) {

  var mentorId = req.params.MentorId;
  var menteeId = req.params.MenteeId;
  var userId = req.params.UserId;
  var token = req.params.Token;

  var check = await authorizeMatchWrapper(userId, token); if (check) {
    sql.connect(config, function (err) {

      if (err) console.log(err);

      var request = new sql.Request();

      request.input('Mentor', sql.Int, mentorId)
      .input('Mentee', sql.Int, menteeId)
      .query('select * from [Pair] where MentorId=@Mentor and MenteeId=@Mentee', function (err, set) {

        if (err) console.log(err);
        res.send(set);

      });

    });
  } else {
   res.send({success:false});
  }

});

app.get('/pair/mentor/:MentorId/:UserId/:Token', async function(req, res) {

  var mentorId = req.params.MentorId;
  var userId = req.params.UserId;
  var token = req.params.Token;

  var check = await authorizeMatchWrapper(userId, token); if (check) {
    sql.connect(config, function (err) {

      if (err) console.log(err);

      var request = new sql.Request();

      request.input('input', sql.Int, mentorId)
      .query('select * from [Pair] where MentorId=@input', function (err, set) {

        if (err) console.log(err);
        res.send(set);

      });

    });
  } else {
   res.send({success:false});
  }

});

app.get('/pair/mentee/:MenteeId/:UserId/:Token', async function(req, res) {

  var menteeId = req.params.MenteeId;
  var userId = req.params.UserId;
  var token = req.params.Token;

  var check = await authorizeMatchWrapper(userId, token); if (check) {
    sql.connect(config, function (err) {

      if (err) console.log(err);

      var request = new sql.Request();

      request.input('input', sql.Int, menteeId)
      .query('select * from [Pair] where MenteeId=@input', function (err, set) {

        if (err) console.log(err);
        res.send(set);

      });

    });
  } else {
   res.send({success:false});
  }

});

app.post('/create-pair', async function(req, res) {

  var mentorId = req.body.MentorId;
  var menteeId = req.body.MenteeId;
  var token = req.body.Token;
  var date = new Date();
  var privacyAccepted = 0;
  var mentorPrivacyAccepted = 0;
  var menteePrivacyAccepted = 0;

  var check = await authorizeAdminWrapper(token); if (check) {
    sql.connect(config, function (err) {

      if (err) console.log(err);

      var mentorPrivRequest = new sql.Request();

      mentorPrivRequest.input('MentorId', sql.Int, mentorId)
      .query('select PrivacyAccepted as priv from [User] where Id=@MentorId', function(err, set) {

        if (err) console.log(err);
        mentorPrivacyAccepted = set.recordset[0].priv;

        var menteePrivRequest = new sql.Request();

        menteePrivRequest.input('MenteeId', sql.Int, menteeId)
        .query('select PrivacyAccepted as priv from [User] where Id=@MenteeId', function(err, set) {

          if (err) console.log(err);
          menteePrivacyAccepted = set.recordset[0].priv;

          if (menteePrivacyAccepted == 1 && mentorPrivacyAccepted == 1) {
            privacyAccepted = 1;
          }

          var request = new sql.Request();

          request
          .input('MentorId', sql.Int, mentorId)
          .input('MenteeId', sql.Int, menteeId)
          .input('Date', sql.SmallDateTime, date)
          .input('PrivacyAccepted', sql.Int, privacyAccepted)
          .query('insert into [Pair] (MentorId, MenteeId, Created, LastUpdate, PrivacyAccepted) values (@MentorId, @MenteeId, @Date, @Date, @PrivacyAccepted)', function(err, set) {

            if (err) console.log(err);
            res.send(set);

          });

        });

      });

    });
  } else {
   res.send({success:false});
  }

});

app.post('/delete-pair', async function(req, res) {

  var id = req.body.Id;
  var token = req.body.Token;

  var check = await authorizeAdminWrapper(token); if (check) {
    sql.connect(config, function (err) {

      if (err) console.log(err);

      var request = new sql.Request();

      request
      .input('Id', sql.Int, id)
      .query('delete from [Pair] where Id=@Id', function(err, set) {

        if (err) console.log(err);
        res.send(set);

      });

    });
  } else {
   res.send({success:false});
  }

});

// ------------------------------------- //
//             Topic Table               //
// ------------------------------------- //

app.get('/current-topic/:UserId/:Token', async function(req, res) {

  var userId = req.params.UserId;
  var token = req.params.Token;

  var check = await authorizeMatchWrapper(userId, token); if (check) {
    sql.connect(config, function (err) {

      if (err) console.log(err);

      var request = new sql.Request();

      request
      .query('select * from [Topic] where ActiveTopic=1', function (err, set) {

        if (err) console.log(err);
        res.send(set);

      });

    });
  } else {
    res.send({success:false});
  }

});

app.get('/all-topics/:UserId/:Token', async function(req, res) {

  var userId = req.params.UserId;
  var token = req.params.Token;

  var check = await authorizeMatchWrapper(userId, token); 
  
  if (check) {
    sql.connect(config, function (err) {

      if (err) console.log(err);

      var request = new sql.Request();

      request
      .query('select * from [Topic] where ActiveTopic=0 order by Created DESC', function (err, set) {

        if (err) console.log(err);
        res.send(set);

      });

    });
  } else {
   res.send({success:false});
  }

});

app.get('/topic/:Id/:UserId/:Token', async function(req, res) {

  var topicId = req.params.Id;
  var userId = req.params.UserId;
  var token = req.params.Token;

  var check = await authorizeMatchWrapper(userId, token); if (check) {
    sql.connect(config, function (err) {

      if (err) console.log(err);

      var request = new sql.Request();

      request.input("Id", sql.Int, topicId)
      .query('select * from [Topic] where Id=@Id', function (err, set) {

        if (err) console.log(err);
        res.send(set);

      });

    });
  } else {
   res.send({success:false});
  }

});

app.post('/create-topic', async function(req, res) {

  var postedBy = req.body.PostedBy;
  var dueDate = req.body.DueDate;
  var title = req.body.Title;
  var description = req.body.Description;
  var token = req.body.Token;
  var date = new Date();

  var check = await authorizeAdminWrapper(token);
  if (check) {
    sql.connect(config, function (err) {
      if (err) console.log(err);

      var request = new sql.Request();

      request
      .query('select ExpoPushToken from [User] where Type=0', function(err, set) {
        if (err) console.log(err);
        var pushTokens = []
        for (var i=0; i<set.recordset.length; i++) {
          pushTokens.push(set.recordset[i].ExpoPushToken)
        }

        sendMessagesNotification(pushTokens, 'New Topic', 'CS/M has posted a new topic!', true, {Screen:'TopicsScreen'})

        sql.connect(config, function (err) {

          if (err) console.log(err);

          var request = new sql.Request();

          request
          .input('PostedBy', sql.Int, postedBy)
          .input('DueDate', sql.SmallDateTime, dueDate)
          .input('Title', sql.VarChar, title)
          .input('Description', sql.VarChar, description)
          .input('Date', sql.SmallDateTime, date)
          .query('insert into [Topic] (PostedBy, DueDate, Title, Description, Created, LastUpdate) values (@PostedBy, @DueDate, @Title, @Description, @Date, @Date)', function(err, set) {

            if (err) console.log(err);
            res.send(set);

          });

        });
      })
    })
  } else {
   res.send({success:false});
  }

});

app.post('/update-topic', async function(req, res) {

  var id = req.body.Id;
  var postedBy = req.body.PostedBy;
  var dueDate = req.body.DueDate;
  var title = req.body.Title;
  var description = req.body.Description;
  var activeTopic = req.body.ActiveTopic;
  var token = req.body.Token;
  var date = new Date();

  var check = await authorizeAdminWrapper(token); if (check) {
    sql.connect(config, function (err) {

      if (err) console.log(err);

      var request = new sql.Request();

      request
      .input('Id', sql.Int, id)
      .input('PostedBy', sql.Int, postedBy)
      .input('DueDate', sql.SmallDateTime, dueDate)
      .input('Title', sql.VarChar, title)
      .input('Description', sql.VarChar, description)
      .input('Date', sql.SmallDateTime, date)
      .input('ActiveTopic', sql.Int, activeTopic)
      .query('update [Topic] set PostedBy=@PostedBy, DueDate=@DueDate, Title=@Title, Description=@Description, LastUpdate=@Date, ActiveTopic=@ActiveTopic where Id=@Id', function(err, set) {

        if (err) console.log(err);
        res.send(set);

      });

    });
  } else {
   res.send({success:false});
  }

});

app.post('/delete-topic', async function(req, res) {

  var id = req.body.Id;
  var token = req.body.Token;

  var check = await authorizeAdminWrapper(token); if (check) {
    sql.connect(config, function (err) {

      if (err) console.log(err);

      var request = new sql.Request();

      request
      .input('Id', sql.Int, id)
      .query('delete from [Topic] where Id=@Id', function(err, set) {

        if (err) console.log(err);
        res.send(set);

      });

    });
  } else {
   res.send({success:false});
  }

});



// ------------------------------------- //
//              User Table               //
// ------------------------------------- //



// GET all Users
app.get('/all-users/:Token', async function (req, res) {

  var token = req.params.Token;
  var check = await authorizeAdminWrapper(token); if (check) {
    sql.connect(config, function (err) {

      if (err) console.log(err);

      var request = new sql.Request();
      request.query('select * from [User]', function (err, set) {

        if (err) console.log(err);
        res.send(set);

      });

    });
  } else {
   res.send({success:false});
  }

});

// GET User by Id
app.get('/user/id/:UserId/:Token', async function(req, res) {

  var userId = req.params.UserId;
  var token = req.params.Token;

  var check = await authorizeMatchWrapper(userId, token); if (check) {
    sql.connect(config, function (err) {

      if (err) console.log(err);

      var request = new sql.Request();

      request.input('input', sql.Int, userId)
      .query('select * from [User] where Id=@input', function (err, set) {

        if (err) console.log(err);
        res.send(set);

      });

    });
  } else {
    res.send({success:false});
  }

});

// Checks if a user token exists, and if it doesn't, sets a new user token.
async function ensureUserTokenExists(email, tokenComponent) {
  let hasToken = await userTokenExistsWrapper(email);
  console.log("HasToken: ", hasToken);
  if (!hasToken) {
    hasToken = await setNewUserTokenWrapper(email, tokenComponent);
  }
  console.log("HasToken: ", hasToken);
  return hasToken;
}

// Set a new user token.
async function setNewUserToken(email, tokenComponent, callback) {
  var newToken = crypto.createHash('sha256').update(tokenComponent + new Date().toString()).digest('hex');
  console.log("New Token: ", newToken);
  await sql.connect(config, (err) => {
    if (err) console.log(err);
    var request = new sql.Request();
    request
    .input('AccessToken', sql.VarChar, newToken)
    .input('Email', sql.VarChar, email)
    .query('update [User] set Token=@AccessToken where Email=@Email', (err, set) => {
      if (err) console.log(err);
      console.log("New Set: ", set);
      callback(set.rowsAffected > 0);
    });
  }); 
}

// Wrapper for setting a new user token.
async function setNewUserTokenWrapper(email, tokenComponent) {
  return new Promise((resolve) => {
      setNewUserToken(email,tokenComponent,(callback) => {
          resolve(callback);
      });
  });
}

// Check if a user token exists.
async function userTokenExists(email, callback) {
  sql.connect(config, function (err) {
    if (err) console.log(err);
    var request = new sql.Request();
    request
    .input('Email', sql.VarChar, email)
    .query('select Token from [User] where Email=@Email', function (err, set) {
      if (err) console.log(err);
      if (set.recordset.length > 0) {
        callback(true);
      } else {
        callback(false);
      }
    });
  });
}

// Wrapper for checking if a user token exists.
async function userTokenExistsWrapper(email) {
    return new Promise((resolve) => {
        userTokenExists(email,(callback) => {
            resolve(callback);
        });
    });
}

// GET User Id & Token Using LinkedInToken
app.get('/user/access/:LinkedInToken', async function (req, res)
{
  var linkedInToken = req.params.LinkedInToken;

  console.log(linkedInToken);

  // get email address from LinkedIn
  const emailres = await fetch('https://api.linkedin.com/v2/clientAwareMemberHandles?q=members&projection=(elements*(primary,type,handle~))', {
    method: 'GET',
    headers: {
      Authorization: 'Bearer ' + linkedInToken,
    }
  });
  const emailPayload = await emailres.json();

  console.log(emailPayload);

  var email = emailPayload.elements[0]["handle~"].emailAddress;
  if (email) {
    if (await ensureUserTokenExists(email, linkedInToken))
    {
      sql.connect(config, function (err) {
        if (err) console.log(err);
        var request = new sql.Request();
        request.input('input', sql.VarChar, email)
        .query('select Id, Token from [User] where Email=@input', function (err, set) {
          if (err) console.log(err);
          console.log("Sending Set: ", set);
          res.send(set);
        });
      });
    } else {
      console.log("Token does not exist...");
      res.send({success:false});
    }
  } else {
    console.log("No valid email...");
    res.send({success:false});
  }
});

// GET Other User by Id, UserId, Token
app.get('/user/other/:TargetId/:UserId/:Token', async function (req, res) {

  var targetId = req.params.TargetId;
  var userId = req.params.UserId;
  var token = req.params.Token;

  var check = await authorizePairWrapper(targetId, userId, token); if (check) {
    sql.connect(config, function (err) {

      if (err) console.log(err);

      var request = new sql.Request();

      request.input('targetId', sql.Int, targetId)
      .query('select FirstName,LastName,Email,Avatar,Id from [User] where Id=@targetId', function (err, set) {

        if (err) console.log(err);
        res.send(set);

      });

    });
  } else {
    res.send({success:false});
  }
});

// GET User by Email
app.get('/user-via-email/:Email/:Token', async function(req, res) {

  var email = req.params.Email;
  var token = req.params.Token;

  var check = await authorizeExistsWrapper(token); if (check) {
    sql.connect(config, function (err) {

      if (err) console.log(err);

      var request = new sql.Request();

      request.input('input', sql.VarChar, email)
      .query('select Id from [User] where Email=@input', function (err, set) {

        if (err) console.log(err);
        res.send(set);

      });

    });
  } else {
   res.send({success:false});
  }

});

app.post('/create-user', async function(req, res) {

  var email = req.body.Email;
  var firstName = req.body.FirstName;
  var lastName = req.body.LastName;
  var avatar = req.body.Avatar;
  var token = req.body.Token;
  var expoPushToken = req.body.ExpoPushToken;
  var date = new Date();
  var privacyAccepted = req.body.PrivacyAccepted;

  var check = await authorizeExistsWrapper(token); if (check) {
    sql.connect(config, function (err) {

      if (err) console.log(err);

      var request = new sql.Request();

      request
      .input('Email', sql.VarChar, email)
      .input('FirstName', sql.VarChar, firstName)
      .input('LastName', sql.VarChar, lastName)
      .input('Avatar', sql.VarChar, avatar)
      .input('ExpoPushToken', sql.VarChar, expoPushToken)
      .input('Date', sql.SmallDateTime, date)
      .input('PrivacyAccepted', sql.Int, privacyAccepted)
      .query('insert into [User] (Email, FirstName, LastName, Avatar, ExpoPushToken, Created, LastUpdate, PrivacyAccepted) values (@Email, @FirstName, @LastName, @Avatar, @ExpoPushToken, @Date, @Date, @PrivacyAccepted)', function(err, set) {

        if (err) console.log(err);
        res.send(set);

      });

    });
  } else {
   res.send({success:false});
  }

});

app.post('/update-privacy', async function(req, res) {

  var email = req.body.Email;
  var privacyAccepted = req.body.PrivacyAccepted;
  var userId = req.body.UserId;
  var token = req.body.Token;

  var check = await authorizeMatchWrapper(userId, token); if (check) {
    sql.connect(config, function (err) {

      if (err) console.log(err);

      var request = new sql.Request();

      request
      .input('PrivacyAccepted', sql.Int, privacyAccepted)
      .input('Email', sql.VarChar, email)
      .query('update [User] set PrivacyAccepted=@PrivacyAccepted where Email=@Email', function(err, set) {

        if (err) console.log(err);
        res.send(set);

      });

    });
  } else {
    res.send({success:false});
  }

});

app.post('/update-expo-push-token', async function(req, res) {

  var email = req.body.Email;
  var expoPushToken = req.body.ExpoPushToken;
  var userId = req.body.UserId;
  var token = req.body.Token;

  var check = await authorizeMatchWrapper(userId, token); if (check) {
    sql.connect(config, function (err) {

      if (err) console.log(err);

      var request = new sql.Request();

      request
      .input('ExpoPushToken', sql.VarChar, expoPushToken)
      .input('Email', sql.VarChar, email)
      .query('update [User] set ExpoPushToken=@ExpoPushToken where Email=@Email', function(err, set) {

        if (err) console.log(err);
        res.send(set);

      });

    });
  } else {
   res.send({success:false});
  }

});

app.post('/update-approved', async function(req, res) {

  var email = req.body.Email;
  var approved = req.body.Approved;
  var token = req.body.Token;
  var userId = req.body.UserId;
  var check = await authorizeMatchWrapper(userId, token); if (check) {
    sql.connect(config, function (err) {

      if (err) console.log(err);

      var request = new sql.Request();

      request
      .input('Approved', sql.Int, approved)
      .input('Email', sql.VarChar, email)
      .query('update [User] set Approved=@Approved where Email=@Email', function(err, set) {

        if (err) console.log(err);
        res.send(set);

      });

    });
  } else {
   res.send({success:false});
  }

});

app.post('/delete-user', async function(req, res) {

  var id = req.body.Id;
  var token = req.body.Token;

  var check = await authorizeAdminWrapper(token); if (check) {
    sql.connect(config, function (err) {

      if (err) console.log(err);

      var request = new sql.Request();

      request
      .input('Id', sql.Int, id)
      .query('delete from [User] where Id=@Id', function(err, set) {

        if (err) console.log(err);
        res.send(set);

      });

    });
  } else {
   res.send({success:false});
  }

});

// ------------------------------------- //
//           UserContact Table           //
// ------------------------------------- //


app.get('/contact/:UserId/:Token', async function(req, res) {

  var id = req.params.UserId;
  var token = req.params.Token;

  var check = await authorizeExistsWrapper(token); if (check) {
    sql.connect(config, function (err) {

      if (err) console.log(err);

      var request = new sql.Request();

      request.input("Id", sql.Int, id)
      .query('select * from [UserContact] where UserId=@Id', function (err, set) {

        if (err) console.log(err);
        res.send(set);

      });

    });
  } else {
   res.send({success:false});
  }

});

app.post('/create-contact', async function(req, res) {

  var userId = req.body.UserId;
  var token = req.body.Token;
  var contactValue = req.body.ContactValue;
  var contactType = req.body.ContactType;
  var date = new Date();

  var check = await authorizeMatchWrapper(userId, token); if (check) {
    sql.connect(config, function (err) {

      if (err) console.log(err);

      var request = new sql.Request();

      request
      .input('UserId', sql.Int, userId)
      .input('ContactValue', sql.VarChar, contactValue)
      .input('ContactType', sql.VarChar, contactType)
      .input('Date', sql.SmallDateTime, date)
      .query('insert into [UserContact] (UserId, ContactValue, ContactType, Created, LastUpdate) values (@UserId, @ContactValue, @ContactType, @Date, @Date)', function(err, set) {

        if (err) console.log(err);
        res.send(set);

      });

    });
  } else {
   res.send({success:false});
  }


});

app.post('/update-contact', async function(req, res) {

  var id = req.body.Id;
  var userId = req.body.UserId;
  var token = req.body.Token;
  var contactValue = req.body.ContactValue;
  var contactType = req.body.ContactType;
  var date = new Date();

  var check = await authorizeMatchWrapper(userId, token); if (check) {
    sql.connect(config, function (err) {

      if (err) console.log(err);

      var request = new sql.Request();

      request
      .input('Id', sql.Int, id)
      .input('UserId', sql.Int, userId)
      .input('ContactValue', sql.VarChar, contactValue)
      .input('ContactType', sql.VarChar, contactType)
      .input('Date', sql.SmallDateTime, date)
      .query('update [UserContact] set ContactValue=@ContactValue, ContactType=@ContactType where Id=@Id and UserId=@UserId', function(err, set) {

        if (err) console.log(err);
        res.send(set);

      });

    });
  } else {
   res.send({success:false});
  }

});

app.post('/delete-contact', async function(req, res) {

  var id = req.body.Id;
  var userId = req.body.UserId;
  var token = req.body.Token;

  var check = await authorizeMatchWrapper(userId, token); if (check) {
    sql.connect(config, function (err) {

      if (err) console.log(err);

      var request = new sql.Request();

      request
      .input('Id', sql.Int, id)
      .query('delete from [UserContact] where Id=@Id', function(err, set) {

        if (err) console.log(err);
        res.send(set);

      });

    });
  } else {
   res.send({success:false});
  }

});

var server = app.listen(process.env.PORT || 80, function () {
  var port = server.address().port;
  console.log("App live on port", port);
});
