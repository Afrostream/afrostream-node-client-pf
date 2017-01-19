const Q = require('q');
const assert = require('better-assert');

const anr = require('afrostream-node-request');

/*
 * TODO: refactor, shouldn't cache pfContent & ... between others
 * TODO: refactor, remove "var that = this;"
 */
class PFClient {
  constructor(options) {
    assert(options);
    assert(typeof options.baseUrl === 'string' && options.baseUrl);

    this.requestBaseUrl = options.baseUrl;
    this.requestTimeout = options.requestTimeout || 10000;
    this.logger = options.logger || console;
    this.statsd = options.statsd || {
      client: {
        increment: () => { /* noop */ }
      }
    };
    this.pfMd5Hash = options.pfMd5Hash || null;
    this.pfBroadcasterName = options.pfBroadcasterName || null;
    this.pfContent = null;
    this.pfProfiles = null;
    this.randomContentProfile = null;
    this.manifests = null;
    // request Object
    this.setRequestOptions({
      timeout: this.requestTimeout,
      baseUrl: this.requestBaseUrl,
      name: 'REQUEST-PF',
      filter: anr.filters['200OKNotEmpty']
    });
  }

  setRequestOptions(options) {
    assert(options);
    assert(options.baseUrl);

    this._request = anr.create(options);
  }

  request(options) {
    const readableQueryString = Object.keys(options.qs || []).map(k => k + '=' + options.qs[k]).join('&');
    const readableUrl = this.requestBaseUrl + options.uri + (readableQueryString ? '?' + readableQueryString : '');

    this.logger.log(readableUrl);
    this.statsd.client.increment('request.pf.hit');

    return this._request(options).then(
      data => {
        this.statsd.client.increment('request.pf.success');
        return data[1]; // body
      },
      err => {
        this.statsd.client.increment('request.pf.error');
        throw err; // fwd
      }
    );
  }

  setMd5Hash(pfMd5Hash) {
    this.pfMd5Hash = pfMd5Hash;
  }

  setBroadcasterName(pfBroadcasterName) {
    this.pfBroadcasterName = pfBroadcasterName;
  }

  getContentById(pfContentId) {
    assert(pfContentId);

    var that = this;

    if (this.pfContent) {
      return Q(this.pfContent);
    }
    return this.request({
      uri: '/api/contents/' + pfContentId
    }).then(pfContents => {
      // postprocessing, this api return an array of result
      if (!pfContents) {
        throw new Error('[PF]: no content associated to hash ' + that.pfMd5Hash);
      }
      if (!Array.isArray(pfContents)) {
        throw new Error('[PF]: malformed content result');
      }
      if (pfContents.length === 0) {
        throw new Error('[PF]: no content found');
      }
      if (pfContents.length > 1) {
        that.logger.warn('multiple content (' + pfContents.length + ') found');
      }
      // returning first content.
      that.pfContent = pfContents[0];
      that.pfMd5Hash = that.pfContent.md5Hash;
      return that.pfContent;
    });
  }

  getContent() {
    assert(this.pfMd5Hash);

    var that = this;

    if (this.pfContent) {
      return Q(this.pfContent);
    }
    return this.request({
      uri: '/api/contents',
      qs: {
        md5Hash: this.pfMd5Hash
      }
    }).then(pfContents => {
      // postprocessing, this api return an array of result
      if (!pfContents) {
        throw new Error('[PF]: no content associated to hash ' + that.pfMd5Hash);
      }
      if (!Array.isArray(pfContents)) {
        throw new Error('[PF]: malformed content result');
      }
      if (pfContents.length === 0) {
        throw new Error('[PF]: no content found');
      }
      if (pfContents.length > 1) {
        that.logger.warn('multiple content (' + pfContents.length + ') found');
      }
      // returning first content.
      that.pfContent = pfContents[0];
      return that.pfContent;
    });
  }

  getContentsStreams() {
    assert(this.pfContent);

    var that = this;

    if (this.pfContentsStreams) {
      return Q(this.pfContentsStreams);
    }
    return this.request({
      uri: `/api/contents/${this.pfContent.contentId}/contentsStreams`,
    }).then(pfContentsStreams => {
      // postprocessing, this api return an array of result
      if (!pfContentsStreams) {
        throw new Error('[PF]: no contents-streams associated to hash ' + that.pfContent.contentId);
      }
      if (!Array.isArray(pfContentsStreams)) {
        throw new Error('[PF]: malformed content result');
      }
      if (pfContentsStreams.length === 0) {
        throw new Error('[PF]: no contents-streams found');
      }
      // returning first content.
      that.pfContentsStreams = pfContentsStreams;
      return that.pfContentsStreams;
    });
  }

  getProfiles() {
    assert(this.pfBroadcasterName);

    var that = this;

    if (this.pfProfiles) {
      return Q(this.pfProfiles);
    }
    return this.request({
        uri: '/api/profiles'
      })
      .then(function filter(profiles) {
        if (!Array.isArray(profiles)) {
          throw new Error("profiles format");
        }
        that.pfProfiles = profiles.filter(profile => profile.broadcaster === that.pfBroadcasterName);
        return that.pfProfiles;
      });
  }

  getContentRandomProfile() {
    var that = this;

    if (this.randomContentProfile) {
      return Q(this.randomContentProfile);
    }
    return Q.all([
        this.getContent(),
        this.getProfiles()
      ])
      .then(data => {
        const pfContent = data[0];

        if (!Array.isArray(pfContent.profilesIds)) {
          throw new Error('[PF]: ' + that.pfMd5Hash + ' pfContent.profilesIds is not an array');
        }
        if (!pfContent.profilesIds.length) {
          throw new Error('[PF]: ' + that.pfMd5Hash + ' no profiles in pfContent.profilesIds');
        }
        return data;
      })
      .then(([pfContent, pfProfiles]) => {
        // intersecting profiles & contentProfiles, pick a random profile (first one)
        var profile = pfProfiles.filter(profile => pfContent.profilesIds.indexOf(profile.profileId) !== -1)[0];
        if (!profile) {
          throw new Error('[PF]: ' + that.pfMd5Hash + '|' + that.pfBroadcasterName + ' no intersecting profile found');
        }
        that.randomContentProfile = profile;
        return that.randomContentProfile;
      });
  }

  getAssetsStreams() {
    var that = this;

    if (this.pfAssetsStreams) {
      return Q(this.pfAssetsStreams);
    }
    // we assume getContentRandomProfile loads every thing...
    return this.getContentRandomProfile()
      .then(randomProfile => this.request({
        uri: '/api/assetsStreams',
        qs: {
          md5Hash: that.pfMd5Hash,
          profileName: randomProfile.name,
          broadcaster: that.pfBroadcasterName
        }
      }))
      .then(assetsStreams => {
        if (!Array.isArray(assetsStreams)) {
          throw new Error('[PF]: assetsStreams should be an array');
        }
        if (!assetsStreams.length) {
          throw new Error('[PF]: assetsStreams should not be empty');
        }
        that.pfAssetsStreams = assetsStreams;
        return assetsStreams;
      });
  }

  getManifests() {
    var that = this;
    if (this.manifests) {
      return Q(this.manifests);
    }
    return this.getContent()
      .then(pfContent => this.request({
        uri: '/api/pfManifest',
        qs: {
          contentId: pfContent.contentId,
          broadcaster: that.pfBroadcasterName
        }
      }))
      .then(function checkResult(manifests) {
        if (!manifests) {
          throw new Error('[PF]: ' + that.pfContent.contentId + '|' + that.pfBroadcasterName + ' missing manifests');
        }
        if (!Array.isArray(manifests.manifests)) {
          throw new Error('[PF]: ' + that.pfContent.contentId + '|' + that.pfBroadcasterName + ' format error');
        }
        return manifests;
      })
      .then(function convert(manifests) {
        /*
           INPUT:
           {
             manifests: [
              {
                type: "dash",
                url: "/vod/MBO_101_Afrostream_V2/4fa35e68bb15991b.ism/4fa35e68bb15991b.mpd"
              },
              (...)
            ]
          }

          OUTPUT:
          [
            {
              src: "/vod/STOMPTHEYARDHOMECOMING_178_25_ProRes422_FRA_ENG_HD_STEREO/795074629ea59630.ism/795074629ea59630.mpd",
              type: "application/dash+xml"
            }
            (...)
          ],
        */
        var pfTypeToContentType = {
          dash: "application/dash+xml",
          hls: "application/vnd.apple.mpegurl",
          smooth: "application/vnd.ms-sstr+xml"
        };

        return manifests.manifests.map(manifest => {
          var contentType = pfTypeToContentType[manifest.type];

          if (!contentType) {
            that.logger.error(that.pfContent.contentId + '|' + that.pfBroadcasterName + ' unknown manifest type: ' + manifest.type, manifests);
          }
          return {
            src: manifest.url,
            type: contentType
          };
        });
      })
      .then(manifests => {
        that.manifests = manifests;
        return manifests;
      });
  }

  getContents(state) {
    var that = this;
    return this.request({
      uri: '/api/contents',
      qs: {
        state: state || 'ready'
      }
    }).then(pfContents => {
      // postprocessing, this api return an array of result
      if (!pfContents) {
        throw new Error('[PF]: no content associated to hash ' + that.pfMd5Hash);
      }
      if (!Array.isArray(pfContents)) {
        throw new Error('[PF]: malformed content result : ', JSON.stringify(pfContents));
      }
      return pfContents;
    });
  }

  getTSAsset() {
    assert(this.pfContent);

    var that = this;

    return this.request({
      uri: `/api/contents/${this.pfContent.contentId}/assets`,
      qs: {
        profileName: this.pfBroadcasterName,
        presetsType: 'ffmpeg'
      }
    }).then(assets => {
      // postprocessing, this api return an array of result
      if (!Array.isArray(assets)) {
        throw new Error('[PF]: TSFile search: malformed assets for ' + that.pfContent.contentId);
      }
      if (assets.length === 0) {
        throw new Error('[PF]: TSFile search: no assets');
      }

      /*
       * tempfix: regression dans l'api PF, qui ne filtre plus correctement suivant le broadcasterName & presetsType...
       *  on devrait fixer côté PF, mais pour l'instant on hack côté client-pf
       */
      assets = assets.filter(function (asset) {
        return asset.filename && asset.filename.match(/^.*\.ts$/);
      });

      if (assets.length === 0) {
        throw new Error('[PF]: TSFile search: no assets (2)');
      }

      const asset = assets.pop();

      if (!asset.filename || !asset.filename.match(/.*\.ts$/)) {
        throw new Error(`[PF]: TSFile search: malformed filename =${asset.filename}`);
      }
      return asset;
    });
  }
}

module.exports = {
  PFClient: PFClient
};
