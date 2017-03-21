'use strict';

const config = require('../config');

module.exports = (mrf, logger) => {
  return (req, res, next) => {
    mrf.connect( config.mediaserver, (ms) => {
      req.ms = ms ;
      next() ;
    }, (err) => {
      logger.error(`Error connecting to media server`, err) ;
      res.send(503, 'No media resources') ;
    }) ; 
  };
} ;