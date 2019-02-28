import { Router } from '../../routes.js'

function User() {
  return <div>Welcome to {Router.router.asPath} @ {JSON.stringify(Router.router.query)}</div>;
}


export default User;
