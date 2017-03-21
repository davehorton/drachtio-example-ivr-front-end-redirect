'use strict';

module.exports = (logger) => {
  return (req, res, next) => {
    req.ms.createEndpoint({
      remoteSdp: req.body,
      codecs: ['PCMU']
    }, (err, ep) => {
      if( err ) {
        logger.error(`Error allocating endpoint`, err) ;
        req.ms.disconnect() ;
        return res.send(503, 'No media resources') ;
      }
      req.ep = ep ;
      next() ;
    }) ;
  };
} ;