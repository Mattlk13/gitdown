import createGitinfo from 'gitinfo';
import _ from 'lodash';

const helper = {};
helper.compile = (config, context) => {
  const parserConfig = context.gitdown.getConfig().gitinfo;
  const gitinfo = createGitinfo.default({
    gitPath: parserConfig.gitPath,
    ...parserConfig.defaultBranchName && {
      defaultBranchName: parserConfig.defaultBranchName,
    },
  });

  const methodMap = {
    branch: 'getBranchName',
    name: 'getName',
    url: 'getGithubUrl',
    username: 'getUsername',
  };

  if (!config.name) {
    throw new Error('config.name must be provided.');
  }

  if (!methodMap[config.name]) {
    throw new Error('Unexpected config.name value ("' + config.name + '").');
  }

  if (!_.isFunction(gitinfo[methodMap[config.name]])) {
    throw new TypeError('Gitinfo module does not provide function "' + config.name + '".');
  }

  return gitinfo[methodMap[config.name]]();
};

helper.weight = 10;

export default helper;
