const drachtio = require('drachtio') ;
const app = drachtio() ;
const config = require('./config');
const Logger = require('./lib/logger'); 
const logger = new Logger( config.logging ) ;
const Srf = require('drachtio-srf'); 
const srf = new Srf(app);
const Mrf = require('drachtio-fsmrf') ;
const mrf = new Mrf(config.drachtio) ;
const mwConnect = require('./lib/connect_to_ms')( mrf, logger) ;
const mwAllocateEndpoint = require('./lib/allocate_endpoint')( logger) ;
const routeCall = require('./lib/route_call');

srf.connect( config.drachtio ) 
.on('connect', (err, hostport) => { logger.info(`connected to drachtio listening on ${hostport}`) ;})
.on('error', (err) => { logger.error(`Error connecting to drachtio at ${config.drachtio}`, err) ; }) ;

srf.locals.logger = logger ;

srf.use('invite', (req, res, next) => {
  logger.debug(`${req.get('Call-Id')}: received call from ${req.callingNumber}`);
  req.on('cancel', () => { 
    logger.info(`call canceled by caller`);
    req.canceled = true ;
    req.app.locals.cleanUp(); 
  }) ;
  next() ;
}) ;
srf.use( 'invite', mwConnect ) ;
srf.use( 'invite', mwAllocateEndpoint) ;

srf.invite( (req, res) => {
  let ms = req.app.locals.ms ;
  let ep = req.app.locals.ep ;
  req.app.locals.cleanUp = cleanUpMaker( ms, ep );

  // might have got a cancel while we were allocating endpoint
  if( req.canceled === true ) {
    return ;
  }
  
  routeCall( req, res, srf, ep) ;
}) ;

// closure to allow it to be called more than once but only do the job once
function cleanUpMaker( ms, ep ) {

  let idx = 0  ;

  return function() {
    logger.debug(`cleaning up media ${idx}`);
    if( idx++ < 1 ) {
      if( !!ep ) { ep.destroy() ; }
      if( !!ms ) { ms.disconnect(); }          
    }
  } ;
}
