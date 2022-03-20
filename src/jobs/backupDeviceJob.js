const { writeDeviceMetaFileAsync, addFileAsync } = require('../app')
const { newIdNumber } = require('../fns')
const fs = require('fs-extra')
const checkDiskSpace = require('check-disk-space').default
const path = require('path')
const {
  getDeviceByIdAsync, getSourceFilesToBackupAsync
} = require('../repo')
const { deviceName, isDeviceOnlineAsync } = require('../devices')
const { scanDevices } = require('./scanDeviceJob')
const { ensureFilePathExistsAsync, findUniqueFilenameAsync } = require('../path')
const { copyAndHashAsync } = require('../crypto')

module.exports.createBackupDevicesJobAsync = async (sourceDeviceIds, backupDeviceId) => {
  const id = newIdNumber()
  let _abort = false
  async function executeAsync (log) {
    const context = { log, sourceDevice: null, freeSpace: null, addedHashes: {}, backupDevice: null, tempFilename: null, sourceFile: null }

    context.backupDevice = await getDeviceByIdAsync(backupDeviceId)
    if (!context.backupDevice || context.backupDevice.deviceType !== 'backup') {
      log.error(`Backup device does not exist ${backupDeviceId}. Exiting`)
      throw new Error(`Backup device does not exist ${backupDeviceId}`)
    }

    if ((await isDeviceOnlineAsync(context.backupDevice)) === false) {
      log.error('Backup device is not online. Exiting')
      throw new Error('Backup device is not online. Exiting')
    }

    log.info('Scanning devices before backup')
    await scanDevices(log, sourceDeviceIds, () => _abort)

    for (const deviceId of sourceDeviceIds) {
      if (_abort) break

      log.info(`Backing up device ${deviceId}`)
      context.sourceDevice = await tryLoadDeviceAsync(log, deviceId, 'source')
      if (!context.sourceDevice) continue

      const filesToBackup = await getSourceFilesToBackupAsync(context.sourceDevice.id)

      context.freeSpace = (await checkDiskSpace(context.backupDevice.path)).free

      for (const f of filesToBackup) {
        context.sourceFile = f
        context.tempFilename = ''

        try {
          if (context.addedHashes[context.sourceFile.hash]) {
            log.info(`Another file backed up has same contents. skipping ${context.sourceFile.relativePath}`)
            continue
          }

          if (context.freeSpace < context.sourceFile.size) {
            log.warn(`Not enough free space. Skipping ${context.sourceFile.relativePath}`)
            continue
          }

          await backupFile(log, context)
        } catch (error) {
          handleBackupFileError(error, log, context)
        }
      }
      await writeDeviceMetaFileAsync(context.backupDevice)
    }
  }

  async function handleBackupFileError (error, log, context) {
    log.error(`failed backing up file ${context.sourceFile.relativePath}. Skipping`, error)

    if (context.tempFilename) {
      try {
        await fs.rm(context.tempFilename, { force: true })
      } catch (error) {
        // NOOP
      }
    }

    // Update free space in case insufficient space caused copy to fail
    try {
      context.freeSpace = (await checkDiskSpace(context.backupDevice.path)).free
    } catch (error) {
      // NOOP
    }
  }

  async function tryLoadDeviceAsync (log, deviceId, deviceType) {
    const device = (await getDeviceByIdAsync(deviceId))

    if (!device || device.deviceType !== 'source') {
      log.warn(`${deviceType} device with id does not exist ${deviceId}`)
      return null
    }

    const isDeviceOnline = await isDeviceOnlineAsync(device)
    if (!isDeviceOnline) {
      log.warn(`${deviceType} Device offline: ${deviceName(device)}`)
      return null
    }
    return device
  }

  async function backupFile (log, context) {
    const sourceFilename = path.join(context.sourceDevice.path, context.sourceFile.relativePath)
    let targetFilename = path.join(context.backupDevice.path, context.sourceFile.relativePath)
    await ensureFilePathExistsAsync(targetFilename)
    targetFilename = await findUniqueFilenameAsync(targetFilename)
    context.tempFilename = targetFilename + '.tmp'

    log.info(`Copying file to backup device ${sourceFilename} -> ${targetFilename}`)

    await fs.rm(context.tempFilename, { force: true })
    const backupHash = await copyAndHashAsync(sourceFilename, context.tempFilename)

    context.freeSpace -= context.sourceFile.size

    if (backupHash !== context.sourceFile.hash) {
      log.warn(`Source file hash differs from backup file. source ${context.sourceFile.hash}, destination ${backupHash}`)
    }
    const newTargetFilename = await findUniqueFilenameAsync(targetFilename)
    if (newTargetFilename !== targetFilename) {
      log.warn(`target filename already exists but didnt when we started copying ${newTargetFilename}`)
    }

    await fs.move(context.tempFilename, newTargetFilename)
    await addFileAsync(context.backupDevice, targetFilename, backupHash)
    // two files to backup could have the same hash. We only want to copy one of them
    context.addedHashes[backupHash] = true
  }

  async function abort () {
    _abort = true
  }

  return { id, executeAsync, context: { sourceDeviceIds, backupDeviceId }, abort, name: 'BackupDeviceJob' }
}
