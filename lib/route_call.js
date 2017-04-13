'use strict';

const config = require('../config') ;
const async = require('async');

module.exports = (req, res, srf, ep) => {

  let logger = req.app.locals.logger ;
  logger.debug('routing call now') ;

  async.waterfall([
    normalizeDid.bind( null, req, res, srf, ep ),
    establishDialog,
    playAndCollect,
    doRouting
  ], (err, did, opts, req, res, srf, ep, uasDlg, dtmf, uacDlg ) => {
    if( err ) {
      logger.info(`error routing: ${err.message}`);
      req.app.locals.cleanUp() ;

      if( !res.finished ) {
        if( 'redirect' === opts.redirectType ) { 
          res.send(503);
        }  
        else {
          uasDlg.destroy() ;
        }
      }
      return ;
    }
    logger.debug('successfully routed call');

    if( uacDlg ) {
      uasDlg.on('destroy', () => { 
        uacDlg.destroy(); 
      }) ; 
      uacDlg.on('destroy', () => { 
        uasDlg.destroy(); 
      }) ; 
    }
  }) ;
} ;

function normalizeDid( req, res, srf, ep, callback ) {
  let did = req.calledNumber ;
  let logger = req.app.locals.logger ;

  if( /\d{10}/.test( did ) ) {
    did =  `+1${did}` ;
  }

  if( !did || !(did in config.routing) ) {
    logger.info(`called number ${did} has no routing instructions; returning 503`);
    return callback(new Error(`No routing instructions found for ${did}`), did, null, req, res);
  }

  let opts = config.routing[did] ;
  logger.debug(`normalized did ${did}, routing ${JSON.stringify(opts)}`);
  callback(null, did, opts, req, res, srf, ep);
}

function establishDialog( did, opts, req, res, srf, ep, callback ) {
  let logger = req.app.locals.logger ;

  if( -1 === ['b2bua','redirect','refer'].indexOf( opts.redirectType ) ) {
    return callback( new Error(`invalid redirectType: '${opts.redirectType}', valid choices are 'b2bua' and 'redirect'`), did, opts, req, res);
  }

  logger.debug(`sending 183`);
  res.send(183, 'Session Progress', {
    body: ep.local.sdp
  }) ;
    
  // sleep 1 sec
  setTimeout( function() {
    if( 'redirect' === opts.redirectType ) {
      return callback( null, did, opts, req, res, srf, ep, null );
    }

    let headers = {} ;
    ['Session-Expires'].forEach( (h) => {
      if( req.has(h) ){ 
        headers[h] = req.get(h) ;
      }
    });

    srf.createUasDialog( req, res, {
      headers: headers,
      localSdp: ep.local.sdp
    }, (err, dlg) => {
      if( err ) {
        return callback( err, did, opts, req, res );
      }
      callback( null, did, opts, req, res, srf, ep, dlg );  
    });
  }, 1000) ;
}
function playAndCollect( did, opts, req, res, srf, ep, dlg, callback ) {
  let logger = req.app.locals.logger ;

  logger.debug(`doing play and collect`);

  ep.playCollect( opts.playCollect, (err, results) => {
    if( req.canceled === true || (!!dlg && !dlg.connected )) {
      return callback( new Error('caller hung up'), did, opts, req, res );
    }

    if( err ) { 
      return callback( err, did, opts, req, res ) ;
    }

    logger.debug(`playCollect finished`, results) ;
    
    // release media
    req.app.locals.cleanUp() ;

    callback( null, did, opts, req, res, srf, ep, dlg, results.digits ) ;
  });
}
function doRouting( did, opts, req, res, srf, ep, dlg, dtmf, callback ) {
  let logger = req.app.locals.logger ;
  let route = opts.routes[dtmf] || opts.routes['default'] ;
  if( !route ) {
    return callback( new Error(`no route or default route found for ${did}`), did, opts, req, res, srf, ep, dlg, dtmf) ;
  }

  let uri = generate_routeable_uri( logger, req, res, config.sbc, route, opts.redirectType ) ;


  logger.debug(`routing call to ${uri}`);

  if( !uri ) {
    return callback( new Error(`invalid routing configuration: ${route}`), did, opts, req, res);
  }
  if( 'redirect' === opts.redirectType ) {
    res.send( 302, {
      headers: {
        'Contact': uri
      }
    }) ;
    callback( null, did, opts, req, res, srf, ep, dlg, dtmf, null ) ;
  }
  else if( 'b2bua' === opts.redirectType ) {
    let headers = {} ;
    ['From', 'Session-Expires', 'Min-SE', 'Supported','Content-Disposition'].forEach( (h) => {
      if( req.has(h) ){ 
        headers[h] = req.get(h) ;
      }
    });
    srf.createUacDialog( uri, {
      headers: headers,
      localSdp: req.body
    }, 
      (err, uacDlg) => {
        if( err ) {
          return callback( err, did, opts, req, res ) ;
        }
        callback( null, did, opts, req, res, srf, ep, dlg, dtmf, uacDlg ) ;
      }
    );
  }
  else if( 'refer' === opts.redirectType ) {
    dlg.refer({
      headers: {
        'Refer-To': uri
      }
    }, (/*err, res*/) => {
      logger.debug(`successfully sent refer to ${uri}`); 
      dlg.destroy() ;
    });
  }
}

function generate_routeable_uri( logger, req, res, sbc, route, strategy ) {

  let vias = req.getParsedHeader('Via');

  // phone number
  if( /^[\d\+]*$/.test( route ) ) {
    if( 'redirect' === strategy ) {
      return `<sip:${route}@${sbc.address}:${sbc.port}>` ;
    }
    else if( 'b2bua'  === strategy ) {
      return `sip:${route}@${sbc.address}:${sbc.port}` ;
    }
    else {
      return `<sip:${req.calledNumber}@${vias[0].host}:${vias[0].port || 5060};ring-to=${route}>` ;
    }
  }
  

  // sip uri
  if( /^<sip:/.test( route ) ) {
    return route ;
  }

}

