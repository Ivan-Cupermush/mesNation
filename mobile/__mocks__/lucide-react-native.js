/* Иконки в тестах: любой импорт из lucide-react-native — пустой компонент. */
const React = require('react');
const Icon = () => null;
module.exports = new Proxy({ __esModule: true }, {
  get: (target, name) => (name in target ? target[name] : Icon),
});
