const Path = require('path');
const Promise = require('bluebird');
const glob = require('glob');
const _ = require('lodash');
const Locator = require('./locator.js');

/**
 * Parser is responsible for matching all of the instances of the Gitdown JSON and invoking
 * the associated operator functions. Operator functions are invoked in the order of the weight
 * associated with each function. Each operator function is passed the markdown document in
 * its present state (with alterations as a result of the preceding operator functions) and the
 * config from the JSON. This process is repeated until all commands have been executed and
 * parsing the document does not result in alteration of its state, i.e. there are no more Gitdown
 * JSON hooks that could have been generated by either of the preceding operator functions.
 *
 * @param {Gitdown} gitdown
 * @returns {Parser}
 */
const Parser = (gitdown) => {
  let bindingIndex;

  bindingIndex = 0;

  const helpers = {};
  const parser = {};

  /**
   * Iterates markdown parsing and execution of the parsed commands until all of the
   * commands have been executed and the document does not no longer change after parsing it.
   *
   * @param {string} markdown
   * @param {Array} commands
   * @returns {Promise} Promise is resolved with the state object.
   */
  parser.play = (markdown, commands = []) => {
    return Promise
      .try(async () => {
        const state = parser.parse(markdown, commands);
        const actState = await parser.execute(state);

        actState.commands
          .filter((command) => {
            return !command.executed;
          });

        if (actState.done) {
          return actState;
        } else {
          return parser.play(actState.markdown, actState.commands);
        }
      });
  };

  /**
   * Parses the markdown for Gitdown JSON. Replaces the said JSON with placeholders for
   * the output of the command defined in the JSON.
   *
   * @see http://stackoverflow.com/questions/26910402/regex-to-match-json-in-a-document/26910403
   * @param {string} inputMarkdown
   * @param {Array} commands
   */
  parser.parse = (inputMarkdown, commands) => {
    let outputMarkdown;

    const ignoreSection = [];

    outputMarkdown = inputMarkdown;

    // console.log('\n\n\n\ninput markdown:\n\n', markdown);

    // @see http://regex101.com/r/zO0eV6/2
    // console.log('markdown (before)', markdown);

    // /[\s\S]/ is an equivalent of /./m
    outputMarkdown = outputMarkdown.replace(/<!--\sgitdown:\soff\s-->[\S\s]*?(?:$|<!--\sgitdown:\son\s-->)/g, (match) => {
      ignoreSection.push(match);

      return '⊂⊂I:' + ignoreSection.length + '⊃⊃';
    });

    outputMarkdown = outputMarkdown.replace(/({"gitdown"[^}]+})/g, (match) => {
      let command;

      try {
        command = JSON.parse(match);
      } catch {
        throw new Error('Invalid Gitdown JSON ("' + match + '").');
      }

      const name = command.gitdown;
      const config = {
        ...command,
      };

      // eslint-disable-next-line fp/no-delete
      delete config.gitdown;

      bindingIndex++;

      if (!helpers[name]) {
        throw new Error('Unknown helper "' + name + '".');
      }

      commands.push({
        bindingIndex,
        config,
        executed: false,
        helper: helpers[name],
        name,
      });

      return '⊂⊂C:' + bindingIndex + '⊃⊃';
    });

    outputMarkdown = outputMarkdown.replace(/⊂⊂I:(\d+)⊃⊃/g, (match, p1) => {
      return ignoreSection[Number.parseInt(p1, 10) - 1];
    });

    return {
      commands,
      markdown: outputMarkdown,
    };
  };

  /**
   * Execute all of the commands sharing the lowest common weight against
   * the current state of the markdown document.
   *
   * @param {object} state
   * @returns {Promise} Promise resolves to a state after all of the commands have been resolved.
   */
  parser.execute = async (state) => {
    const notExecutedCommands = state.commands.filter((command) => {
      return !command.executed;
    });

    if (!notExecutedCommands.length) {
      state.done = true;

      return Promise.resolve(state);
    }

    // Find the lowest weight among all of the not executed commands.
    const lowestWeight = _.minBy(notExecutedCommands, 'helper.weight').helper.weight;

    // Find all commands with the lowest weight.
    const lowestWeightCommands = _.filter(notExecutedCommands, (command) => {
      return command.helper.weight === lowestWeight;
    });

    // Execute each command and update markdown binding.
    await Promise
      .resolve(lowestWeightCommands)
      .each(async (command) => {
        const context = {
          gitdown,
          locator: Locator,
          markdown: state.markdown,
          parser,
        };

        const value = await Promise.resolve(command.helper.compile(command.config, context));

        state.markdown = state.markdown.replace('⊂⊂C:' + command.bindingIndex + '⊃⊃', () => {
          return value;
        });

        command.executed = true;
      });

    return state;
  };

  /**
   * Load in-built helpers.
   *
   * @private
   */
  parser.loadHelpers = () => {
    glob.sync(Path.resolve(__dirname, './helpers/*.js')).forEach((helper) => {
      parser.registerHelper(Path.basename(helper, '.js'), require(helper));
    });
  };

  /**
   * @param {string} name
   * @param {object} helper
   */
  parser.registerHelper = (name, helper = {}) => {
    if (helpers[name]) {
      throw new Error('There is already a helper with a name "' + name + '".');
    }

    if (_.isUndefined(helper.weight)) {
      helper.weight = 10;
    }

    if (_.isUndefined(helper.compile)) {
      throw new TypeError('Helper object must defined "compile" property.');
    }

    helpers[name] = helper;
  };

  /**
   * @returns {object}
   */
  parser.helpers = () => {
    return helpers;
  };

  parser.loadHelpers();

  return parser;
};

module.exports = Parser;
