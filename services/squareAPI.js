'use strict';

/* * * * * */
/* SQUARE API */
/* * */

/* * */
/* IMPORTS */
const config = require('config');

/* * */
/* Prepare the request parameters */
/* according to the Square API requirements. */

/* * */
/* Where and which service to call the Square API. */
exports.setAPIEndpoint = (service) => {
  return 'https://connect.squareup.com/v2/' + service;
};

/* * */
/* Set headers with Application Type, API Version and Authorization details. */
exports.setRequestHeaders = () => {
  return {
    'Content-Type': 'application/json',
    'Square-Version': '2019-12-17',
    Authorization: 'Bearer ' + config.get('secrets.square-auth-token'),
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
            end_at: new Date(),
          },
        },
        state_filter: {
          states: ['COMPLETED'],
        },
      },
      sort: {
        sort_field: 'CLOSED_AT',
        sort_order: 'ASC',
      },
    },
  });
};
