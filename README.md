# Description

client to new video plateform aka "PF"

# Install

```
npm install afrostream-node-client-pf
```

# Usage

```
const { PFClient } = require('afrostream-node-client-pf');
const pf = new PFClient({
  baseUrl: ...
});


```

# API

you can setup a custom object from scratch

```
const { PFClient } = require('afrostream-node-client-pf');
const client = new PFClient({
  logger: logger.prefix('PF'),
  statsd: statsd,
  timeout: 4242,
  baseUrl: ...
});
client.setMd5Hash(pfMd5Hash);
client.setBroadcasterName('BOUYGUES');
client.getContent()
 .then(pfContent => { (...) })
```

or init once for all

```
const { configure } = require('afrostream-node-client-pf');

const PreconfiguredClient = configure({
  logger: console,
  statsd: statsd,
  timeout: 4242,
  baseUrl: ...
})

const client = new PreconfiguredClient();
client.setMd5Hash(pfMd5Hash);
client.setBroadcasterName('BOUYGUES');
client.getContent()
 .then(pfContent => { (...) })
```
