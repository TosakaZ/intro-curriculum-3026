'use strict';
const jade = require('jade');
const Cookies = require('cookies');
const moment = require('moment-timezone');
const util = require('./handler-util');
const Post = require('./post');

const trackingIdKey = 'tracking_id';
const weeks = ['日', '月', '火', '水', '木', '金', '土'];

function handle(req, res) {
  const cookies = new Cookies(req, res);
  addTrackingCookie(cookies);

  switch (req.method) {
    case 'GET':
      res.writeHead(200, {
        'Content-Type': 'text/html',
        'charset': 'utf-8'
      });
      Post.findAll({ order: 'id DESC' }).then((posts) => {
        posts.forEach((post) => {
          post.content = post.content.replace(/\n/g, '<br>');
          // 出来るだけ自力で、投稿日時に(曜日)を表示させてみたい
          post.formattedCreatedAt = moment(post.createdAt).tz('Asia/Tokyo').format('YYYY年MM月DD日(d) HH時mm分ss秒');
          // dddd => monday / ddd => mon / dd => mo / d => 1 ※ 0~6 => Sunday~Saturday
        // パターン1：マッチキャプチャした文字列に、RegExp.$1 を使う方法
          //if ( post.formattedCreatedAt.match(/\((\d)\)/) )    // RegExp.$1 に曜日番号を入れる
          //  post.formattedCreatedAt = post.formattedCreatedAt.replace(/\((\d)\)/, '(' + weeks[RegExp.$1 * 1] + ')');
          // $1 のまま使うと「$1 は、定義されてない」とエラーになるが、RegExp.$1 だとナゼかその点はクリアされる
          // match なり replace なりのメソッドを実行した時には、RegExp.$1 を使用するとその値は 0 になるが、その後使用するとナゼかちゃんと目的の値が代入されている。
          // ゆえに、ワザと match をした後に本命の replace を実行した。
        // パターン2：マッチキャプチャした文字列に、アロー関数を使う方法
          //post.formattedCreatedAt = post.formattedCreatedAt.replace(/\((\d)\)/, 
          //  ($0, $1) => '(' + weeks[$1*1] + ')'
          //);
          // こちらも $1 の定義エラー対策で、アロー関数の引数として渡すことでクリアされる。
          // また、$0 は、正規表現で検索した文字列そのものが入る。(0) とか (6)
          // 関数の引数に、$0 も一緒に入れてやらないと $1 だけだとナゼか上手く処理されない。
          
          // どっちでも同じ結果だが、どちらも理解できないことが出てきた。
          
        // パターン3：パターン2 を MDN の解説に則って正しく変更
          post.formattedCreatedAt = post.formattedCreatedAt.replace(/\((\d)\)/,
            (match, p1) => '(' + weeks[p1] + ')'
          );
          // match => $& や &0 の代わり、p1~pn => $1 ~ $n の代わり
          // [参照] String.prototype.replace() - JavaScript | MDN
          // https://developer.mozilla.org/ja/docs/Web/JavaScript/Reference/Global_Objects/String/replace
        });
        res.end(jade.renderFile('./views/posts.jade', {
          posts: posts,
          user: req.user
        }));
        console.info(
          `閲覧されました: user: ${req.user}, ` +
          `trackingId: ${cookies.get(trackingIdKey)},` +
          `remoteAddress: ${req.connection.remoteAddress}, ` +
          `userAgent: ${req.headers['user-agent']} `
          );
      });
      break;
    case 'POST':
      req.on('data', (data) => {
        data = data.toString().replace(/\+/g, ' ');		// 半角スペースが + になるのを防ぐ
        const decoded = decodeURIComponent(data);
        const content = decoded.split('content=')[1];
        console.info('投稿されました: ' + content);
        Post.create({
          content: content,
          trackingCookie: cookies.get(trackingIdKey),
          postedBy: req.user
        }).then(() => {
          handleRedirectPosts(req, res);
        });
      });
      break;
    default:
      util.handleBadRequest(req, res);
      break;
  }
}

function handleDelete(req, res) {
  switch (req.method) {
    case 'POST':
      req.on('data', (data) => {
        const decoded = decodeURIComponent(data);
        const id = decoded.split('id=')[1];
        Post.findById(id).then((post) => {
          if (req.user === post.postedBy || req.user === 'admin') {
            post.destroy();
            console.info(
              `削除されました: user: ${req.user}, ` +
              `remoteAddress: ${req.connection.remoteAddress}, ` +
              `userAgent: ${req.headers['user-agent']} `
              );
          }
          handleRedirectPosts(req, res);
        });
      });
      break;
    default:
      util.handleBadRequest(req, res);
      break;
  }
}

function addTrackingCookie(cookies) {
  if (!cookies.get(trackingIdKey)) {
    const trackingId = Math.floor(Math.random() * Number.MAX_SAFE_INTEGER);
    const tomorrow = new Date(new Date().getTime() + (1000 * 60 * 60 * 24));
    cookies.set(trackingIdKey, trackingId, { expires: tomorrow });
  }
}

function handleRedirectPosts(req, res) {
  res.writeHead(303, {
    'Location': '/posts'
  });
  res.end();
}

module.exports = {
  handle: handle,
  handleDelete: handleDelete
};
