/*
this module contains the database api for the application

 */
const db = require('./db')

/*
Common
==================================================================================
*/

exports.getSourceFilesToBackupAsync = async (sourceDeviceId) => {
  return await db.allAsync(`
    select s.*
    from files s left join files b on
        s.hash = b.hash
        and b.deleted = 0
        and b.deviceType = 'backup'
    where
      b.id is null and s.deviceId = ?
      and s.deviceType = 'source'

  `, sourceDeviceId)
}

/*
Source devices
======================================================================================
*/
exports.addDeviceAsync = async function ({ deviceType, id, name, description, path }) {
  const lastScanDate = 0
  const lastBackupDate = 0
  const addDate = Date.now()
  await db.runAsync(
        `insert into devices(
        deviceType, id, name, description, path,lastScanDate, lastBackupDate, addDate)
        values(?,?,?,?,?,?,?,?)`,
        deviceType,
        id,
        name,
        description,
        path,
        lastScanDate,
        lastBackupDate,
        addDate
  )
  return { id, name, description, path, lastScanDate, lastBackupDate, addDate }
}

exports.deleteDeviceAsync = async function (id) {
  await db.performInTransactionAsync(async () => {
    await db.runAsync('delete from files where deviceId=?', id)
    await db.runAsync('delete from devices where id = ?', id)
  })
}

exports.getDevicesAsync = async function (deviceType) {
  return await db.allAsync('select * from devices where deviceType = ?', deviceType)
}

exports.getDeviceByIdAsync = async function (id) {
  return await db.getAsync(`
        select *
        from
            devices
        where
            id = ?`
  , id)
}

exports.updateDeviceAsync = async function ({ id, name, description, path }) {
  await db.runAsync(`
    update
      devices
        set name=?, description = ?, path = ?
        where id = ?
    `, name, description, path, id)
}

exports.setDeviceScanDateAsync = async function (id) {
  await db.runAsync(`
    update
        devices
        set lastScanDate = ?
        where id = ?
    `, Date.now(), id)
}

/*
Backup Devices
=====================================================================================================
*/

/*
Files
=====================================================================================================
*/

exports.deleteFileAsync = async function (id) {
  await db.runAsync(
        `
        update files set
        deleted = 1, editDate = ?
        where id= ?
    `, Date.now(), id)
}

exports.fileExistsAsync = async function (id) {
  return !!(
    await db.getAsync(
            `
  select case
    when exists(select * from files where id = ?) then 1 else 0 end fileExists`,
            id
    )
  ).fileExists
}

exports.addFileAsync = async function ({
  id,
  deviceType,
  deviceId,
  relativePath,
  mtimeMs,
  birthtimeMs,
  size,
  hash,
  deleted,
  addDate
}) {
  await db.runAsync(
        `
  insert into files(id, deviceType, deviceId, relativePath, mtimeMs, birthtimeMs, size, hash, deleted, addDate, editDate)
  values(?,?,?,?,?,?,?,?,?,?,?)
  `,
        id,
        deviceType,
        deviceId,
        relativePath,
        mtimeMs,
        birthtimeMs,
        size,
        hash,
        deleted,
        addDate,
        Date.now()
  )
}

exports.unDeleteFileAsyc = async function (id) {
  await db.runAsync(`
    update files set
    deleted = 0,
    editDate = ?
    where id= ?
  `, Date.now(), id)
}

exports.getFileByIdAsync = async function (id) {
  const result = await db.getAsync(
        `
  select * from files where id = ?
  `, id
  )
  if (result) {
    result.deleted = !!result.deleted
  }
  return result
}

exports.getFilesByDeviceAsync = async (id) => {
  return await db.allAsync('select * from files where deviceId = ? and deleted = 0', id)
}

exports.getFileIdsByDeviceAsync = async (id) => {
  const results = await db.allAsync('select id from files where deviceId = ? and deleted = 0', id)
  return results.map(x => x.id)
}

/*
Backup Files
=====================================================================================================
*/

exports.getAllBackupFilesAsync = async function () {
  return await db.allAsync("select * from files where deviceType = 'backup'")
}
