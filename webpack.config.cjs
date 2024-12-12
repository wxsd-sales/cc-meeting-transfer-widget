const path = require("path");
const Dotenv = require('dotenv-webpack');


const config = {
  mode: "production",
  entry: "./src/widget-SDK-Voice.js",
  output: {
    path: path.resolve(__dirname, "src/build"),
    filename: "bundle.js",
    publicPath: "build/"
  },
  module: {
    rules: [
      {
        use: "babel-loader",
        test: /\.js$/
      }
    ]
  },
  plugins: [
    new Dotenv()
  ]
};

module.exports = config;
