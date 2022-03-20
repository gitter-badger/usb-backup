#!/usr/bin/env node
'use strict'
const db = require('./db')
db.openDbAsync()
const fs = require('fs-extra')
const open = require('open')
const Inert = require('@hapi/inert')
const path = require('path')
const Hapi = require('@hapi/hapi')
const { schema } = require('./graphql')
const { WebSocketServer } = require('ws')
const { useServer } = require('graphql-ws/lib/use/ws')
const packageJson = require('../package.json')

const port = Number(process.argv[process.argv.length - 1]) || 3857
const serverPort = port + 1
const initApi = async () => {
  const server = new WebSocketServer({
    port: serverPort,
    path: '/graphql'
  })

  useServer({
    schema
    // onConnect: (ctx) => {
    //   console.log('Connect', ctx)
    // },
    // onSubscribe: (ctx, msg) => {
    //   console.log('Subscribe', { ctx, msg })
    // },
    // onNext: (ctx, msg, args, result) => {
    //   console.debug('Next', { ctx, msg, args, result })
    // },
    // onError: (ctx, msg, errors) => {
    //   console.error('Error', { ctx, msg, errors })
    // },
    // onComplete: (ctx, msg) => {
    //   console.log('Complete', { ctx, msg })
    // }
  }, server)

  console.log('API listening to port ' + serverPort)
}

const initSpa = async () => {
  const app = Hapi.server({
    port,
    host: 'localhost',
    routes: {
      files: {
        relativeTo: path.resolve(__dirname, '..', 'public')
      }
    }
  })

  await app.register(Inert)

  app.route({
    method: 'GET',
    path: '/{param*}',
    handler: {
      directory: {
        path: '.',
        redirectToSlash: true,
        index: true
      }
    }
  })

  app.ext('onPreResponse', (request, h) => {
    const response = request.response
    if (response.isBoom && response.output.statusCode === 404) {
      return h.file('index.html')
    }
    return h.continue
  })

  // const server = new ApolloServer({
  //   typeDefs,
  //   resolvers,
  //   plugins: [ApolloServerPluginStopHapiServer({ hapiServer: app })],
  // })

  // await server.start()
  // await server.applyMiddleware({ app })

  await app.start()
  console.log('Server running on %s', app.info.uri)
  await open('http://localhost:' + port)
}

process.on('unhandledRejection', (err) => {
  console.log(err)
  process.exit(1)
})

console.log('usb-backup version ' + packageJson.version)
initSpa().then(() => {
  initApi()
}).then(() => copyArtifacts())

async function copyArtifacts () {
  if (process.env.NODE_ENV !== 'DEV') {
    const cwd = process.cwd()
    await fs.copyFile(path.resolve(__dirname, '../README.md'), path.join(cwd, 'README.md'))
    await fs.copyFile(path.resolve(__dirname, '../assets/run.bat'), path.join(cwd, 'run.bat'))
    await fs.copyFile(path.resolve(__dirname, '../assets/run.sh'), path.join(cwd, 'run.sh'))
  }
}
