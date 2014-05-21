(function () {
  'use strict';

  /**
   * Aggregate info about the databases the installer has been directed to set
   * up.
   */
  var database = exports;

  var lib = require('../../lib'),
    format = require('string-format'),
    path = require('path'),
    build = require('../../lib/xt/build'),
    rimraf = require('rimraf'),
    fs = require('fs'),
    _ = require('lodash'),
    exec = require('execSync').exec;

  _.extend(database, lib.task, /** @exports database */ {

    options: {
      version: {
        required: '<version>',
        description: 'xTuple Version'
      },
      name: {
        required: '<name>',
        description: 'Name of the installation',
        validate: function (arg) {
          if (/\d/.test(arg)) {
            throw new Error('xt.name cannot contain numbers');
          }

          return true;
        }
      },
      pilot: {
        optional: '[boolean]',
        description: 'Additionally create a pilot using a copy of the main database',
        value: false
      },
      maindb: {
        optional: '[path]',
        description: 'Path to primary database .backup/.sql filename to use in production'
      },
      edition: {
        optional: '[string]',
        description: 'The xTuple Edition to install',
        value: 'core'
      },
      demo: {
        optional: '[boolean]',
        description: 'Set to additionally install the demo databases',
        value: false
      },
      quickstart: {
        optional: '[boolean]',
        description: 'Set to additionally install the quickstart databases',
        value: false
      },
      adminpw: {
        optional: '[password]',
        description: 'Password for the database "admin" user for a new database'
      }
    },

    /** @override */
    beforeInstall: function (options) {
      var foundationPath = path.resolve(options.xt.usersrc, 'foundation-database'),
        databases = [ ],
        maindb_path;

      if (options.xt.demo) {
        databases.push({
          dbname: 'xtuple_demo',
          filename: path.resolve(foundationPath, 'postbooks_demo_data.sql'),
          foundation: true
        });
      }
      if (options.xt.quickstart) {
        databases.push({
          dbname: 'xtuple_quickstart',
          filename: path.resolve(foundationPath, 'quickstart_data.sql'),
          foundation: true
        });
      }

      // schedule main database file for installation
      if (_.isString(options.xt.maindb)) {
        maindb_path = path.resolve(options.xt.maindb);
        if (fs.existsSync(maindb_path)) {
          databases.push({
            filename: maindb_path,
            dbname: options.xt.name + '_main',
            foundation: false
          });
        }
        else {
          throw new Error('Database File not found; expected to find '+ maindb_path);
        }

        // schedule pilot for installation
        if (_.isString(options.xt.maindb) && options.xt.pilot === true) {
          databases.push({
            filename: maindb_path,
            dbname: options.xt.name + '_pilot',
            foundation: false
          });
        }
      }

      if (databases.length === 0) {
        throw new Error('No databases have been found for installation');
      }

      options.xt.database.list = databases;
    },

    /** @override */
    executeTask: function (options) {
      if (options.xt.database.list.length === 0) {
        throw new Error('No databases are scheduled to be installed');
      }

      database.buildFoundationDatabases(options);
      database.buildMainDatabases(options);
    },

    buildMainDatabases: function (options) {
      var xt = options.xt,
        extensions = build.editions[xt.edition],
        databases = _.where(xt.database.list, { foundation: false });

      // build the main database and pilot, if specified
      _.each(databases, function (db) {
        rimraf.sync(path.resolve(options.xt.usersrc, 'scripts/lib/build'));

        var buildResult = exec(build.getCoreBuildCommand(db, options));
        if (buildResult.code !== 0) {
          throw new Error(buildResult.stdout);
        }

        // install extensions specified by the edition
        _.each(extensions, function (ext) {
          var result = exec(build.getExtensionBuildCommand(db, options, ext));
          if (result.code !== 0) {
            throw new Error(result.stdout);
          }
        });
      });
    },

    buildFoundationDatabases: function (options) {
      var quickstart = _.findWhere(options.xt.database.list, { dbname: 'xtuple_quickstart' }),
        demo = _.findWhere(options.xt.database.list, { dbname: 'xtuple_demo' }),
        qsBuild, demoBuild;

      rimraf.sync(path.resolve(options.xt.usersrc, 'scripts/lib/build'));
      if (quickstart) {
        qsBuild = exec(build.getSourceBuildCommand(quickstart, options));

        if (qsBuild.code !== 0) {
          throw new Error(JSON.stringify(qsBuild));
        }
      }
      if (demo) {
        demoBuild = exec(build.getSourceBuildCommand(demo, options));

        if (demoBuild.code !== 0) {
          throw new Error(JSON.stringify(demoBuild));
        }
      }
    }
  });
})();
