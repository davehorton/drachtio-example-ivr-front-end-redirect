const drachtio = require('drachtio') ;
const app = drachtio() ;
const Mrf = require('drachtio-fsmrf') ;
const mrf = new Mrf(app) ;
const config = require('./config');
const Logger = require('./lib/logger'); 
const logger = new Logger( config.logging ) ;
const mwConnect = require('./lib/connect_to_ms')( mrf, logger) ;
const mwAllocateEndpoint = require('./lib/allocate_endpoint')( logger) ;

app.connect( config.drachtio ) 
.on('connect', (err, hostport) => {
  logger.info(`connected to drachtio listening on ${hostport}`) ;
})
.on('error', (err) => {
  logger.error(`Error connecting to drachtio at ${config.drachtio}`, err) ;
}) ;


app.use('invite', (req, res, next) => {
  req.on('cancel', () => { 
    logger.info(`call canceled by caller`);
    req.canceled = true ;
    cleanUp(req.ms, req.ep); 
  }) ;
  next() ;
}) ;
app.use( 'invite', mwConnect ) ;
app.use( 'invite', mwAllocateEndpoint) ;

app.invite( (req, res) => {
  let ms = req.ms ;
  let ep = req.ep ;

  if( req.canceled === true ) {
    return ;
  }
  
  res.send(183, 'Session Progress', {
    body: ep.local.sdp
  }) ;

  ep.playCollect({
    file: 'ivr/8000/ivr-please_reenter_your_pin.wav',
    min: 1,
    max: 8,
    tries: 2,
    timeout: 5000,
    digitTimeout: 2000,
    terminators: '#'
  }, (err, results) => {
    if( err ) { 
        logger.error(`Error allocating endpoint`, err) ;
        ms.disconnect() ;
        return res.send(503, 'Media resource failure') ;    
    }

    logger.debug(`playCollect finished`, results) ;

  });

}) ;

function cleanUp( ms, ep ) {
  if( !!ep ) { ep.destroy() ; }
  if( !!ms ) { ms.disconnect(); }
}
