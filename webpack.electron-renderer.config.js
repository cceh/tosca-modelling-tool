const HtmlWebpackPlugin = require("html-webpack-plugin");
const path = require("path")
const ForkTsCheckerWebpackPlugin = require("fork-ts-checker-webpack-plugin");


module.exports = [{
    mode: "development",
    target: "electron-renderer",
    entry: './src/renderer/index.ts',
    devtool: "source-map",
    optimization: {
        minimize: false,
    },
    devServer: {
      watchFiles: ["./src/renderer/**/*"]
    },
    module: {
        rules: [{
            test: /\.ts$/,
            use: {
                loader: 'ts-loader',
                options: {
                    transpileOnly: true,
                },
            },
            exclude: /node_modules/
        }, {
            test: /\.(png|svg|jpg|jpeg|gif)$/i,
            type: 'asset/resource'
        },
            {
                test: /\.html$/i,
                loader: 'html-loader',
            },
        // rules for bootstrap
            {
                test: /\.(scss)$/,
                use: [{
                    // translates CSS into CommonJS modules
                    loader: 'css-loader',
                    options: {
                        exportType: 'css-style-sheet'
                    }
                }, {
                    // Run postcss actions
                    loader: 'postcss-loader',
                    options: {
                        // `postcssOptions` is needed for postcss 8.x;
                        // if you use postcss 7.x skip the key
                        postcssOptions: {
                            // postcss plugins, can be exported to postcss.config.js
                            plugins: function () {
                                return [
                                    require('autoprefixer')
                                ];
                            }
                        }
                    }
                }, {
                    // compiles Sass to CSS
                    loader: 'sass-loader'
                }]
            }
        ]
    },
    resolve: {
        extensions: ['.ts', '.js', '.css', '.scss']
    },
    output: {
        path: __dirname + "/dist/app",
        filename: 'renderer.js',
        // publicPath: "/"
    },
    plugins: [
        new HtmlWebpackPlugin({
            chunksSortMode: 'none',
            template: './src/renderer/index.html'
        }),
        new ForkTsCheckerWebpackPlugin()
    ],
}]
