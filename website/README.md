# TOSCA Modelling Tool landing page 

Landing page as a static site using Jekyll. Based on the [Hydra](https://github.com/CloudCannon/hydra-jekyll-template)
theme by [CloudCannon](https://cloudcannon.com/).

## Develop

The site was built with [Jekyll](http://jekyllrb.com/) version 4.3.2, but should support newer versions as well.

Install the dependencies with [Bundler](http://bundler.io/):

~~~bash
$ bundle install
~~~

Run `jekyll` commands through Bundler to ensure you're using the right versions:

~~~bash
$ JEKYLL_GITHUB_TOKEN=your_github_token bundle exec jekyll serve
~~~

## Downloads section

Uses the `jekyll-github-metadata` gem to generate a link to the latest release from GitHub. This is why
a GitHub access token is needed to generate or serve the site.