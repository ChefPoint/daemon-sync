/* * */
/* * */
/* * * * * */
/* CHEF POINT */
/* SYNC */
/* * */
/* * */

/* Initiate error handling module */
require("./services/errorHandling")();

/* Connect to the database */
require("./services/database")();

/* Start Sync module */
require("./app/sync")();

/*  ╔════════════════════╗  */
/*  ║┌──────────────────┐║  */
/*  ║|      ORDERS      |║  */
/*  ║|   (squareAPI)    |║  */
/*  ║└──────────────────┘║  */
/*  ║          |         ║  */
/*  ║          | SYNC    ║  */
/*  ║          |         ║  */
/*  ║          ▼         ║  */
/*  ║┌──────────────────┐║  */
/*  ║|   TRANSACTIONS   |║  */
/*  ║|    (mongoDB)     |║  */
/*  ║└──────────────────┘║  */
/*  ║          |         ║  */
/*  ╚══════════╬═════════╝  */
/*             |            */
/*             | PROCESS    */
/*             |            */
/*             ▼            */
/*   ┌──────────────────┐   */
/*   |     INVOICES     |   */
/*   |   (vendusAPI)    |   */
/*   └──────────────────┘   */
