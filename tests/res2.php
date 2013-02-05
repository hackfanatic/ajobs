<?php
    Header('Cache-Control: no-cache');
    Header('Pragma: no-cache');

    $t=$_GET['t'];
    sleep($t);
?>
{
	"menu\/featured_items": {
		"featured_1" : 1,
		"featured_2" : 2
	},

	"menu": {
		"param1" : 1,
		"param2" : 2
	},

	"data": {
		"data1" : 1,
		"data2" : 2
	}
}