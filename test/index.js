const { PFClient } = require('../index.js');

const baseUrl = 'http://p-afsmsch-001.afrostream.tv:4000';

const assert = require('better-assert');

describe('when instantiating a new PFClient', () => {
  it('should be able to be instantiated with basic options', (done) => {
    const client = new PFClient({baseUrl:baseUrl});
    done();
  });

  it('should be able to fetch a content by pfContentId', (done) => {
    const client = new PFClient({baseUrl:baseUrl});
    client.getContentById(1604).then((d) => {
      assert(d.contentId)
      assert(d.contentId === 1604);
    })
    .then(
      () => done(),
      done
    );
  });

  it('should be able to fetch profiles', (done) => {
    const client = new PFClient({baseUrl:baseUrl});
    client.setBroadcasterName('BOUYGUES');
    client.getProfiles().then((d) => {
      assert(Array.isArray(d));
      assert(d.length);
      assert(d.some(p => p.profileId === 3));
    })
    .then(
      () => done(),
      done
    );
  });
});
