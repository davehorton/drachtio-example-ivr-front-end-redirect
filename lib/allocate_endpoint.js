'use strict';

module.exports = (logger) => {
  return (req, res, next) => {
    req.app.locals.ms.createEndpoint({
      remoteSdp: req.body,
      codecs: ['PCMU']
    }, (err, ep) => {
      if( err ) {
        logger.error(`Error allocating endpoint`, err) ;
        req.app.locals.ms.disconnect() ;
        return res.send(503, 'No media resources') ;
      }
      req.app.locals.ep = ep ;
      next() ;
    }) ;
  };
} ;