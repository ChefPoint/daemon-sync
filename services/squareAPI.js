/* * */
/* * */
/* * * * * */
/* RETRIEVE TRANSACTIONS FROM SQUARE */
/* AND SAVE THEM TO TRANSACTIONS QUEUE */
/* * */

/* * */
/* IMPORTS */
const request = require("request");
const config = require("config");

/* * */
/* Prepare the request parameters */
/* according to the Square API requirements. */

/* * */
/* Where and which service to call the Square API. */
exports.setAPIEndpoint = service => {
  return "https://connect.squareup.com/v2/" + service;
};

/* * */
/* Set headers with Application Type, API Version and Authorization details. */
exports.setRequestHeaders = () => {
  return {
    "Content-Type": "application/json",
    "Square-Version": "2019-12-17",
    Authorization: "Bearer " + config.get("auth.squareAPI")
  };
};

/* * */
/* Prepare request body to get transactions from store with given locationID, */
/* and filter those transactions by date and time, since last sync. */
exports.setRequestBody = (squareLocationID, lastSyncTime) => {
  return JSON.stringify({
    location_ids: [squareLocationID],
    query: {
      filter: {
        date_time_filter: {
          closed_at: {
            start_at: lastSyncTime,
            end_at: new Date()
          }
        },
        state_filter: {
          states: ["COMPLETED"]
        }
      },
      sort: {
        sort_field: "CLOSED_AT",
        sort_order: "ASC"
      }
    }
  });
};

/* * */
/* Request the Square API for the specified params. */
exports.requestSquareAPI = (params, objectToExtract) => {
  // This method returns a Promise to it's caller,
  // which is only resolved after the correct response from the API.
  return new Promise((resolve, reject) => {
    // Perform the request
    request(params, async (err, res, body) => {
      // Reject if a connection error occurs
      if (err) reject(err);
      // Reject if there is an error with invoice creation
      else if (res.statusCode >= 400 && res.statusCode <= 500)
        reject(JSON.parse(body).errors);
      // Resolve promise with request result
      else resolve(JSON.parse(body)[objectToExtract]);
    });
  });
};
