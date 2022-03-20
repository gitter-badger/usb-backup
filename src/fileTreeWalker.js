const fs = require('fs-extra')
const path = require('path')
const { FileTreeWalkerPathError } = require('./errors')
const { defaultLogger } = require('./logging')

/**
 * Walks the directory structure calling the callback for each file found
 *
 * @param {*} path
 * @param {*} callback The callback function to call for each file found
 * The parameters are
 * err - an error occured processing the file
 * an object containing file (the file full path), path (the folder name), stat, abort (function to call to abort processing)
 *
 * If an error occurs depending on the error file may or may not be populated eg the error occured reading a directory.
 */
async function fileTreeWalkerAsync (rootDir, callback, logger = defaultLogger) {
  const directories = []
  // we want to allow the callback to cancel the process
  let _abort = false
  const abort = () => (_abort = true)
  const process = async (subpath) => {
    try {
      const filesOrDirectories = await fs.readdir(subpath)

      // try process all the files in a directory first.

      // process files in subpath
      while (filesOrDirectories.length > 0) {
        const name = filesOrDirectories.pop()
        const fullPath = path.join(subpath, name)
        try {
          if (_abort) break
          const stat = await fs.stat(fullPath)
          if (stat.isDirectory()) {
            directories.push(fullPath)
          } else if (stat.isFile()) {
            try {
              await callback(null, { filename: fullPath, stat, path: subpath, abort })
            } catch (error) {
              logger.error('file tree walker callback threw an exception, ignoring', error)
            }
          }
        } catch (error) {
          logger.error(`Error processing path ${fullPath}`)
          await callback(new FileTreeWalkerPathError(fullPath), {})
        }
      }

      // process each directory
      while (directories.length > 0) {
        if (_abort) break
        const dir = directories.pop()
        await process(dir)
      }
    } catch (error) {
      logger.error(`Error processing path ${subpath}, ${error}`)
      await callback(new FileTreeWalkerPathError(subpath), {})
    }
  }

  await process(rootDir)
}

module.exports = fileTreeWalkerAsync
