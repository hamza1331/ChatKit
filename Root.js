import React, { Component } from 'react';
import { YellowBox } from 'react-native';
import { createAppContainer } from 'react-navigation';
import LoginScreen from './app/screens/Login';
import ChatScreen from './app/screens/Chat';
import { createStackNavigator } from 'react-navigation-stack';
YellowBox.ignoreWarnings(["Setting a timer"]);

const RootStack = createStackNavigator(
  {
    Login: LoginScreen,
    Chat: ChatScreen
  },
  {
    initialRouteName: "Login"
  }
);

const AppContainer = createAppContainer(RootStack);

class Router extends Component {
  render() {
    return <AppContainer />;
  }
}

export default Router;