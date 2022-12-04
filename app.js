const express = require("express");
const path = require("path");

const { open } = require("sqlite");
const sqlite3 = require("sqlite3");

const app = express();
app.use(express.json());

const bcrypt = require("bcrypt");
const jwt = require("jsonwebtoken");

const dbPath = path.join(__dirname, "covid19IndiaPortal.db");

let db = null;

const initializeDb = async () => {
  try {
    db = await open({
      filename: dbPath,
      driver: sqlite3.Database,
    });

    app.listen(3000, () => {
      console.log("Server running at http://localhost:3000/");
    });
  } catch (e) {
    console.log(`Database Error ${e.message}`);
    process.exit(1);
  }
};

initializeDb();

const convertDbObjectToResponseObject = (dbObject) => {
  return {
    stateName: dbObject.state_name,
    population: dbObject.population,
    districtId: dbObject.district_id,
    districtName: dbObject.district_name,
    stateId: dbObject.state_id,
    cases: dbObject.cases,
    cured: dbObject.cured,
    active: dbObject.active,
    deaths: dbObject.deaths,
  };
};

// MiddlewareFunction
const middleware = (request, response, next) => {
  let jwtToken;
  const authHeader = request.headers["authorization"];
  if (authHeader !== undefined) {
    jwtToken = authHeader.split(" ")[1];
  }
  if (jwtToken === undefined) {
    response.status(401);
    response.send("Invalid JWT Token");
  } else {
    jwt.verify(jwtToken, "tejaMs", async (error, payload) => {
      if (error) {
        response.status(401);
        response.send("Invalid JWT Token");
      } else {
        next();
      }
    });
  }
};

// User Registration
app.post("/register/", async (request, response) => {
  const { username, name, password, gender, location } = request.body;
  const hashedPassword = await bcrypt.hash(request.body.password, 10);
  const selectUserQuery = `SELECT * FROM user WHERE username = '${username}'`;
  const dbUser = await db.get(selectUserQuery);
  if (dbUser === undefined) {
    const createUserQuery = `
      INSERT INTO 
        user (username, name, password, gender, location) 
      VALUES 
        (
          '${username}', 
          '${name}',
          '${hashedPassword}', 
          '${gender}',
          '${location}'
        )`;
    const dbResponse = await db.run(createUserQuery);
    const newUserId = dbResponse.lastID;
    response.send(`Created new user with ${newUserId}`);
  } else {
    response.status = 400;
    response.send("User already exists");
  }
});

//API 1
// User Login
app.post("/login/", async (request, response) => {
  const { username, password } = request.body;
  const selectUserQuery = `SELECT * FROM user WHERE username = '${username}'`;
  const dbUser = await db.get(selectUserQuery);
  if (dbUser === undefined) {
    response.status(400);
    response.send("Invalid user");
  } else {
    const isPasswordMatched = await bcrypt.compare(password, dbUser.password);
    if (isPasswordMatched === true) {
      const payload = { username: username };
      const jwtToken = jwt.sign(payload, "tejaMs");
      response.send({ jwtToken });
    } else {
      response.status(400);
      response.send("Invalid password");
    }
  }
});

//API 2
app.get("/states/", middleware, async (request, response) => {
  const stateNames = `SELECT * FROM state  `;

  const allStatesArray = await db.all(stateNames);

  response.send(
    allStatesArray.map((eachObject) =>
      convertDbObjectToResponseObject(eachObject)
    )
  );
});

// API 3
//API 2 Getting Particular state based on State_iD
app.get("/states/:stateId/", middleware, async (request, response) => {
  const { stateId } = request.params;
  const stateQuery = `
        SELECT * FROM state WHERE state_id = ${stateId}
        `;
  const stateDetails = await db.get(stateQuery);
  response.send(convertDbObjectToResponseObject(stateDetails));
});

//API 4 createing district
app.post("/districts/", middleware, async (request, response) => {
  const newDistrict = request.body;

  const { districtName, stateId, cases, cured, active, deaths } = newDistrict;

  const addingNewDistrict = ` 
        INSERT INTO 
             district (district_name, 
                        state_id, 
                        cases,
                        cured, 
                        active, 
                        deaths )
                VALUES(
                        '${districtName}',
                        '${stateId}',
                        '${cases}',
                        '${cured}',
                        '${active}',
                        '${deaths}')`;

  const dbResponse = await db.run(addingNewDistrict);
  const newDistrictDetails = dbResponse.lastID;
  response.send("District Successfully Added");
});

//API 5 getting district based on district_id
app.get("/districts/:districtId/", middleware, async (request, response) => {
  const { districtId } = request.params;
  const districtDetails = `
        SELECT * FROM district WHERE district_id = ${districtId}
        `;
  const districtArray = await db.get(districtDetails);
  response.send(convertDbObjectToResponseObject(districtArray));
});

//API 6 Removing district from district table
app.delete("/districts/:districtId/", middleware, async (request, response) => {
  const { districtId } = request.params;

  const removeDistrict = `DELETE FROM district  WHERE district_id = ${districtId}`;

  await db.run(removeDistrict);
  response.send("District Removed");
});

//API 7 Update the district based on the district_id
app.put("/districts/:districtId/", middleware, async (request, response) => {
  const { districtId } = request.params;
  const districtDetails = request.body;

  const {
    districtName,
    stateId,
    cases,
    cured,
    active,
    deaths,
  } = districtDetails;

  const updateDistrictDetails = `
        UPDATE district SET 
                           district_name = '${districtName}',
                           state_id = '${stateId}',
                           cases =  '${cases}',
                            cured = '${cured}',
                            active =  '${active}', 
                            deaths = '${deaths}'
                      WHERE district_id = ${districtId}`;

  await db.run(updateDistrictDetails);
  response.send("District Details Updated");
});

//API 8 Getting Statistics of Sarticular state
app.get("/states/:stateId/stats/", middleware, async (request, response) => {
  const { stateId } = request.params;
  const stateQuery = `
        SELECT 
            SUM(cases), 
            SUM(cured),
            SUM(active),
            SUM(deaths)
        FROM district 
        WHERE 
            state_id = ${stateId}
        `;
  const stateDetails = await db.get(stateQuery);

  response.send({
    totalCases: stateDetails["SUM(cases)"],
    totalCured: stateDetails["SUM(cured)"],
    totalActive: stateDetails["SUM(active)"],
    totalDeaths: stateDetails["SUM(deaths)"],
  });
});

module.exports = app;
